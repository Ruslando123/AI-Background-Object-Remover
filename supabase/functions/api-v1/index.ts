import { z } from "zod";
import { authenticateSession } from "../_shared/auth.ts";
import { loadConfig } from "../_shared/config.ts";
import { createAdminClient } from "../_shared/db.ts";
import { AppError } from "../_shared/errors.ts";
import {
  generateStoragePath,
  presignUploadSchema,
  supportedFormats,
  validateFile,
} from "../_shared/files.ts";
import {
  corsHeadersForRequest,
  jsonFailure as buildJsonFailure,
  jsonSuccess as buildJsonSuccess,
  optionsResponse as buildOptionsResponse,
  parseJson,
  pathAfterVersion,
} from "../_shared/http.ts";
import {
  assertInspectedMedia,
  inspectMediaHeader,
  resolutionLimitsForMedia,
} from "../_shared/media-inspection.ts";
import { logEvent } from "../_shared/logger.ts";
import {
  applyProviderResult,
  pollJob,
  submitJobToProvider,
} from "../_shared/processing.ts";
import { createProviderResolver } from "../_shared/providers/registry.ts";
import {
  ownedAsset,
  ownedJob,
  publicJob,
  transitionJobStatus,
} from "../_shared/repository.ts";
import { createSessionToken, hashSessionToken } from "../_shared/security.ts";
import type { ProcessingJob } from "../_shared/types.ts";
import {
  createJobSchema,
  validateOperationAssets,
  validateProviderCapability,
} from "../_shared/validation.ts";

const uuidBody = z.object({ assetId: z.string().uuid() });

function headersRecord(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [...headers.entries()].map(([key, value]) => [key.toLowerCase(), value]),
  );
}

async function handle(request: Request): Promise<Response> {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const started = Date.now();
  let responseHeaders: Record<string, string> = {};

  try {
    const config = loadConfig();
    responseHeaders = corsHeadersForRequest(request, config.allowedOrigins);
    const jsonSuccess = (data: unknown, id: string, status = 200) =>
      buildJsonSuccess(data, id, status, responseHeaders);
    const optionsResponse = () => buildOptionsResponse(responseHeaders);
    const db = createAdminClient(config);
    const resolver = createProviderResolver(config);
    const path = pathAfterVersion(request);
    if (request.method === "OPTIONS") return optionsResponse();

    if (request.method === "POST" && path === "/sessions") {
      const token = createSessionToken();
      const expiresAt = new Date(
        Date.now() + config.sessionTtlHours * 3_600_000,
      ).toISOString();
      const { data, error } = await db
        .from("media_sessions")
        .insert({
          anonymous_token_hash: await hashSessionToken(token),
          status: "active",
          expires_at: expiresAt,
        })
        .select("id,expires_at")
        .single();
      if (error || !data)
        throw new AppError("INTERNAL_ERROR", { cause: error });
      return jsonSuccess(
        { sessionId: data.id, sessionToken: token, expiresAt: data.expires_at },
        requestId,
        201,
      );
    }

    if (request.method === "GET" && path === "/capabilities") {
      const capabilities = resolver
        .resolve("IMAGE_REMOVE_BACKGROUND")
        .getCapabilities();
      return jsonSuccess(
        {
          operations: capabilities.operations,
          formats: supportedFormats(),
          limits: {
            imageMaxBytes: config.imageMaxBytes,
            videoMaxBytes: config.videoMaxBytes,
            videoMaxDurationMs: config.videoMaxDurationMs,
            videoMaxWidth: config.videoMaxWidth,
            videoMaxHeight: config.videoMaxHeight,
          },
          outputFormats: {
            image: ["png", "jpeg", "webp"],
            video: ["mp4", "webm"],
          },
          videoOperationsAvailable: capabilities.operations.some((operation) =>
            operation.startsWith("VIDEO_"),
          ),
          transparentVideo: capabilities.transparentVideo,
          promptBackground: capabilities.promptBackground,
        },
        requestId,
      );
    }

    const webhookMatch = path.match(/^\/webhooks\/([a-z0-9_-]+)$/);
    if (request.method === "POST" && webhookMatch) {
      const providerName = webhookMatch[1]!;
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > config.maxRequestBytes)
        throw new AppError("INVALID_REQUEST");
      const provider = resolver.resolve("IMAGE_REMOVE_BACKGROUND");
      if (
        provider.name !== providerName ||
        !provider.verifyWebhook ||
        !provider.parseWebhook
      )
        throw new AppError("PROVIDER_NOT_CONFIGURED");
      if (!(await provider.verifyWebhook(raw, headersRecord(request.headers))))
        throw new AppError("WEBHOOK_SIGNATURE_INVALID");
      const event = await provider.parseWebhook(
        raw,
        headersRecord(request.headers),
      );
      const inserted = await db
        .from("provider_webhook_events")
        .insert({
          provider: provider.name,
          external_event_id: event.externalEventId,
          provider_job_id: event.providerJobId,
          payload: JSON.parse(raw),
        })
        .select("id")
        .single();
      if (inserted.error?.code === "23505")
        return jsonSuccess({ duplicate: true }, requestId);
      if (inserted.error || !inserted.data)
        throw new AppError("INTERNAL_ERROR", { cause: inserted.error });
      try {
        const found = await db
          .from("processing_jobs")
          .select("*")
          .eq("provider", provider.name)
          .eq("provider_job_id", event.providerJobId)
          .maybeSingle();
        if (found.error || !found.data) throw new AppError("JOB_NOT_FOUND");
        if (found.data.status === "processing")
          await applyProviderResult(
            db,
            config,
            found.data as ProcessingJob,
            event.result,
          );
        await db
          .from("provider_webhook_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("id", inserted.data.id);
        logEvent("webhook_processed", {
          requestId,
          jobId: found.data.id,
          provider: provider.name,
          status: event.result.status,
        });
        return jsonSuccess({ accepted: true }, requestId);
      } catch (error) {
        await db
          .from("provider_webhook_events")
          .update({
            processing_error:
              error instanceof AppError ? error.code : "INTERNAL_ERROR",
          })
          .eq("id", inserted.data.id);
        throw error;
      }
    }

    const deleteSessionMatch = path.match(/^\/sessions\/([0-9a-f-]+)$/i);
    if (request.method === "DELETE" && deleteSessionMatch) {
      const session = await authenticateSession(
        request,
        db,
        deleteSessionMatch[1],
      );
      const now = new Date().toISOString();
      const { error } = await db
        .from("media_sessions")
        .update({ status: "deleted", deleted_at: now, expires_at: now })
        .eq("id", session.id)
        .eq("status", "active");
      if (error) throw new AppError("INTERNAL_ERROR", { cause: error });
      return jsonSuccess({ deleted: true }, requestId);
    }

    const session = await authenticateSession(request, db);

    if (request.method === "POST" && path === "/uploads/presign") {
      const input = await parseJson(request, presignUploadSchema, config);
      const valid = validateFile(input, config);
      const assetId = crypto.randomUUID();
      const storagePath = generateStoragePath(
        session.id,
        assetId,
        input.role,
        valid.extension,
      );
      const uploadExpiresAt = new Date(
        Date.now() + config.uploadTtlSeconds * 1000,
      ).toISOString();
      const created = await db
        .from("media_assets")
        .insert({
          id: assetId,
          session_id: session.id,
          media_type: input.mediaType,
          role: input.role,
          status: "pending_upload",
          storage_bucket: "media-assets",
          storage_path: storagePath,
          original_filename: valid.filename,
          mime_type: input.mimeType,
          extension: valid.extension,
          size_bytes: input.sizeBytes,
          expires_at: session.expiresAt,
          metadata: { uploadExpiresAt },
        })
        .select("id")
        .single();
      if (created.error)
        throw new AppError("INTERNAL_ERROR", { cause: created.error });
      const signed = await db.storage
        .from("media-assets")
        .createSignedUploadUrl(storagePath);
      if (signed.error || !signed.data) {
        await db
          .from("media_assets")
          .update({ status: "failed" })
          .eq("id", assetId);
        throw new AppError("UPLOAD_FAILED", { cause: signed.error });
      }
      return jsonSuccess(
        {
          assetId,
          uploadUrl: signed.data.signedUrl,
          storagePath,
          expiresAt: uploadExpiresAt,
        },
        requestId,
        201,
      );
    }

    if (request.method === "POST" && path === "/assets/complete-upload") {
      const { assetId } = await parseJson(request, uuidBody, config);
      const asset = await ownedAsset(db, session, assetId);
      if (asset.status === "ready")
        return jsonSuccess({ assetId, status: "ready" }, requestId);
      if (asset.status !== "pending_upload")
        throw new AppError("UPLOAD_FAILED");
      const uploadExpiresAt = String(asset.metadata.uploadExpiresAt ?? "");
      if (!uploadExpiresAt || new Date(uploadExpiresAt).getTime() < Date.now())
        throw new AppError("UPLOAD_FAILED", {
          message: "The upload authorization has expired.",
        });
      const pathParts = asset.storage_path.split("/");
      const objectName = pathParts.pop()!;
      const listed = await db.storage
        .from(asset.storage_bucket)
        .list(pathParts.join("/"), {
          search: objectName,
          limit: 2,
        });
      const object = listed.data?.find(
        (candidate) => candidate.name === objectName,
      );
      if (listed.error || !object) throw new AppError("UPLOAD_FAILED");
      const metadata = (object.metadata ?? {}) as Record<string, unknown>;
      const actualSize = Number(metadata.size ?? 0);
      const actualMime = String(
        metadata.mimetype ?? metadata.contentType ?? "",
      ).toLowerCase();
      if (actualSize !== asset.size_bytes)
        throw new AppError("INVALID_MEDIA", {
          message: "The uploaded file size does not match the request.",
        });
      if (actualMime && actualMime !== asset.mime_type)
        throw new AppError("INVALID_MEDIA", {
          message: "The uploaded MIME type does not match the request.",
        });
      const signed = await db.storage
        .from(asset.storage_bucket)
        .createSignedUrl(asset.storage_path, 60);
      if (signed.error || !signed.data) throw new AppError("STORAGE_ERROR");
      const headerResponse = await fetch(signed.data.signedUrl, {
        headers: { Range: "bytes=0-65535" },
      });
      if (!headerResponse.ok) throw new AppError("STORAGE_ERROR");
      const inspected = inspectMediaHeader(
        new Uint8Array(await headerResponse.arrayBuffer()),
      );
      const resolutionLimits = resolutionLimitsForMedia(
        asset.media_type,
        config,
      );
      assertInspectedMedia(
        asset.mime_type,
        inspected,
        resolutionLimits.maxWidth,
        resolutionLimits.maxHeight,
      );
      const updated = await db
        .from("media_assets")
        .update({
          status: "ready",
          width: inspected.width ?? null,
          height: inspected.height ?? null,
        })
        .eq("id", asset.id)
        .eq("status", "pending_upload")
        .select("id,status")
        .single();
      if (updated.error || !updated.data)
        throw new AppError("UPLOAD_FAILED", { cause: updated.error });
      logEvent("upload_completed", { requestId, sessionId: session.id });
      return jsonSuccess({ assetId, status: "ready" }, requestId);
    }

    if (request.method === "POST" && path === "/jobs") {
      const input = await parseJson(request, createJobSchema, config);
      const existing = await db
        .from("processing_jobs")
        .select("*")
        .eq("session_id", session.id)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (existing.error)
        throw new AppError("INTERNAL_ERROR", { cause: existing.error });
      if (existing.data)
        return jsonSuccess(
          publicJob(existing.data as ProcessingJob),
          requestId,
        );
      const since = new Date(Date.now() - 60_000).toISOString();
      const recent = await db
        .from("processing_jobs")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id)
        .gte("created_at", since);
      if (recent.error)
        throw new AppError("INTERNAL_ERROR", { cause: recent.error });
      if ((recent.count ?? 0) >= config.jobRateLimitPerMinute)
        throw new AppError("PROVIDER_RATE_LIMIT", {
          message: "Too many jobs were created. Please wait and try again.",
        });
      const provider = resolver.resolve(input.operation);
      const inputAsset = await ownedAsset(
        db,
        session,
        input.inputAssetId,
        true,
      );
      const mask = input.maskAssetId
        ? await ownedAsset(db, session, input.maskAssetId, true)
        : null;
      const background = input.backgroundAssetId
        ? await ownedAsset(db, session, input.backgroundAssetId, true)
        : null;
      validateOperationAssets(
        input.operation,
        inputAsset,
        mask,
        background,
        input.parameters,
      );
      validateProviderCapability(provider, input.operation, inputAsset);
      const created = await db
        .from("processing_jobs")
        .insert({
          session_id: session.id,
          operation: input.operation,
          status: "draft",
          provider: provider.name,
          input_asset_id: input.inputAssetId,
          mask_asset_id: input.maskAssetId ?? null,
          background_asset_id: input.backgroundAssetId ?? null,
          parameters: input.parameters,
          idempotency_key: input.idempotencyKey,
          max_attempts: config.jobMaxAttempts,
          progress_stage: "validating",
        })
        .select("*")
        .single();
      if (created.error?.code === "23505") {
        const duplicate = await db
          .from("processing_jobs")
          .select("*")
          .eq("session_id", session.id)
          .eq("idempotency_key", input.idempotencyKey)
          .single();
        if (duplicate.error || !duplicate.data)
          throw new AppError("INTERNAL_ERROR");
        return jsonSuccess(
          publicJob(duplicate.data as ProcessingJob),
          requestId,
        );
      }
      if (created.error || !created.data)
        throw new AppError("INTERNAL_ERROR", { cause: created.error });
      await transitionJobStatus(
        db,
        created.data.id,
        "draft",
        "validating",
        {},
        "validating",
      );
      const queued = await transitionJobStatus(
        db,
        created.data.id,
        "validating",
        "queued",
        {},
        "preparing_media",
      );
      logEvent("job_created", {
        requestId,
        sessionId: session.id,
        jobId: queued.id,
        provider: provider.name,
        operation: input.operation,
        status: "queued",
      });
      const processing = await submitJobToProvider(
        db,
        resolver,
        queued,
        inputAsset,
        mask,
        background,
      );
      return jsonSuccess(publicJob(processing), requestId, 201);
    }

    const downloadMatch = path.match(/^\/assets\/([0-9a-f-]+)\/download$/i);
    if (request.method === "GET" && downloadMatch) {
      const asset = await ownedAsset(db, session, downloadMatch[1]!, true);
      const signed = await db.storage
        .from(asset.storage_bucket)
        .createSignedUrl(asset.storage_path, config.downloadTtlSeconds, {
          download: asset.original_filename,
        });
      if (signed.error || !signed.data)
        throw new AppError("DOWNLOAD_FAILED", { cause: signed.error });
      const expiresAt = new Date(
        Date.now() + config.downloadTtlSeconds * 1000,
      ).toISOString();
      logEvent("download_created", { requestId, sessionId: session.id });
      return jsonSuccess(
        {
          downloadUrl: signed.data.signedUrl,
          expiresAt,
          filename: asset.original_filename,
          mimeType: asset.mime_type,
        },
        requestId,
      );
    }

    const retryMatch = path.match(/^\/jobs\/([0-9a-f-]+)\/retry$/i);
    if (request.method === "POST" && retryMatch) {
      const parent = await ownedJob(db, session, retryMatch[1]!);
      if (parent.status !== "failed")
        throw new AppError("INVALID_JOB_TRANSITION");
      if (parent.error_code === "PROVIDER_PERMANENT_FAILURE")
        throw new AppError("PROVIDER_PERMANENT_FAILURE");
      if (parent.attempt_count + 1 >= parent.max_attempts)
        throw new AppError("RETRY_LIMIT_EXCEEDED");
      const inputAsset = await ownedAsset(
        db,
        session,
        parent.input_asset_id,
        true,
      );
      const mask = parent.mask_asset_id
        ? await ownedAsset(db, session, parent.mask_asset_id, true)
        : null;
      const background = parent.background_asset_id
        ? await ownedAsset(db, session, parent.background_asset_id, true)
        : null;
      const retryParameters = { ...parent.parameters };
      if (parent.provider === "mock") delete retryParameters.mockFailureMode;
      const created = await db
        .from("processing_jobs")
        .insert({
          session_id: session.id,
          operation: parent.operation,
          status: "draft",
          provider: parent.provider,
          input_asset_id: parent.input_asset_id,
          mask_asset_id: parent.mask_asset_id,
          background_asset_id: parent.background_asset_id,
          parameters: retryParameters,
          parent_job_id: parent.id,
          attempt_count: parent.attempt_count + 1,
          max_attempts: parent.max_attempts,
          idempotency_key: `retry:${parent.id}:${crypto.randomUUID()}`,
          progress_stage: "validating",
        })
        .select("*")
        .single();
      if (created.error || !created.data)
        throw new AppError("INTERNAL_ERROR", { cause: created.error });
      await db.from("job_events").insert([
        {
          job_id: parent.id,
          event_type: "retry_requested",
          previous_status: "failed",
          next_status: null,
          payload: { retryJobId: created.data.id },
        },
        {
          job_id: created.data.id,
          event_type: "job_retried",
          previous_status: null,
          next_status: "draft",
          payload: { parentJobId: parent.id },
        },
      ]);
      await transitionJobStatus(
        db,
        created.data.id,
        "draft",
        "validating",
        {},
        "validating",
      );
      const queued = await transitionJobStatus(
        db,
        created.data.id,
        "validating",
        "queued",
        {},
        "preparing_media",
      );
      logEvent("job_retried", {
        requestId,
        sessionId: session.id,
        jobId: queued.id,
        provider: parent.provider,
        operation: parent.operation,
      });
      const processing = await submitJobToProvider(
        db,
        resolver,
        queued,
        inputAsset,
        mask,
        background,
      );
      return jsonSuccess(publicJob(processing), requestId, 201);
    }

    const cancelMatch = path.match(/^\/jobs\/([0-9a-f-]+)\/cancel$/i);
    if (request.method === "POST" && cancelMatch) {
      const job = await ownedJob(db, session, cancelMatch[1]!);
      if (job.status === "cancelled")
        return jsonSuccess(publicJob(job), requestId);
      if (job.status === "completed")
        throw new AppError("JOB_ALREADY_COMPLETED");
      if (job.status !== "queued" && job.status !== "processing")
        throw new AppError("INVALID_JOB_TRANSITION");
      const provider = resolver.resolve(job.operation);
      if (job.provider_job_id && provider.cancelJob)
        await provider.cancelJob(job.provider_job_id, job.operation);
      const cancelled = await transitionJobStatus(
        db,
        job.id,
        job.status,
        "cancelled",
        { provider: provider.name },
      );
      return jsonSuccess(publicJob(cancelled), requestId);
    }

    const jobMatch = path.match(/^\/jobs\/([0-9a-f-]+)$/i);
    if (request.method === "GET" && jobMatch) {
      let job = await ownedJob(db, session, jobMatch[1]!);
      if (job.status === "processing")
        job = await pollJob(db, config, resolver, job);
      return jsonSuccess(publicJob(job), requestId);
    }

    throw new AppError("INVALID_REQUEST", {
      message: "The requested endpoint does not exist.",
    });
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError("INTERNAL_ERROR", { cause: error });
    logEvent("request_failed", {
      requestId,
      errorCode: appError.code,
      durationMs: Date.now() - started,
    });
    return buildJsonFailure(appError, requestId, responseHeaders);
  }
}

const deno = (
  globalThis as unknown as {
    Deno: {
      serve(handler: (request: Request) => Response | Promise<Response>): void;
    };
  }
).Deno;
deno.serve(handle);

export { handle };
