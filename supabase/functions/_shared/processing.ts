import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "./config.ts";
import { AppError, ProviderError } from "./errors.ts";
import { generateStoragePath } from "./files.ts";
import { logEvent } from "./logger.ts";
import type {
  ProviderJobStatusResult,
  ProviderOutput,
} from "./providers/provider.ts";
import type { ProviderResolver } from "./providers/registry.ts";
import { transitionJobStatus } from "./repository.ts";
import type { AssetRole, MediaAsset, ProcessingJob } from "./types.ts";

async function providerInput(db: SupabaseClient, asset: MediaAsset) {
  const { data, error } = await db.storage
    .from(asset.storage_bucket)
    .createSignedUrl(asset.storage_path, 300);
  if (error || !data) throw new AppError("STORAGE_ERROR", { cause: error });
  return { id: asset.id, mimeType: asset.mime_type, signedUrl: data.signedUrl };
}

export async function submitJobToProvider(
  db: SupabaseClient,
  resolver: ProviderResolver,
  job: ProcessingJob,
  input: MediaAsset,
  mask: MediaAsset | null,
  background: MediaAsset | null,
): Promise<ProcessingJob> {
  const provider = resolver.resolve(job.operation);
  try {
    await transitionJobStatus(
      db,
      job.id,
      "queued",
      "submitting",
      { provider: provider.name },
      "preparing_media",
    );
  } catch (error) {
    const current = await db
      .from("processing_jobs")
      .select("*")
      .eq("id", job.id)
      .single();
    if (!current.error && current.data?.status !== "queued")
      return current.data as ProcessingJob;
    throw error;
  }
  try {
    const submitted = await provider.submitJob({
      backendJobId: job.id,
      operation: job.operation,
      input: await providerInput(db, input),
      ...(mask ? { mask: await providerInput(db, mask) } : {}),
      ...(background
        ? { background: await providerInput(db, background) }
        : {}),
      parameters: job.parameters,
    });
    const { error } = await db
      .from("processing_jobs")
      .update({
        provider_job_id: submitted.providerJobId,
        provider_request: {
          operation: job.operation,
          inputAssetId: input.id,
          maskAssetId: mask?.id,
          backgroundAssetId: background?.id,
        },
        provider_response: submitted.raw ?? null,
      })
      .eq("id", job.id)
      .eq("status", "submitting");
    if (error) throw new AppError("INTERNAL_ERROR", { cause: error });
    const processing = await transitionJobStatus(
      db,
      job.id,
      "submitting",
      "processing",
      {},
      "preparing_media",
    );
    logEvent("job_submitted", {
      jobId: job.id,
      sessionId: job.session_id,
      provider: provider.name,
      operation: job.operation,
      status: "processing",
    });
    return processing;
  } catch (error) {
    const providerError =
      error instanceof ProviderError
        ? error
        : new ProviderError("PROVIDER_TEMPORARY_FAILURE", { cause: error });
    await transitionJobStatus(db, job.id, "submitting", "failed", {
      errorCode: providerError.code,
    });
    await db
      .from("processing_jobs")
      .update({
        error_code: providerError.code,
        error_message: providerError.safeMessage,
      })
      .eq("id", job.id);
    logEvent("job_failed", {
      jobId: job.id,
      sessionId: job.session_id,
      provider: provider.name,
      operation: job.operation,
      errorCode: providerError.code,
    });
    throw providerError;
  }
}

export async function submitQueuedJob(
  db: SupabaseClient,
  resolver: ProviderResolver,
  job: ProcessingJob,
): Promise<ProcessingJob> {
  const ids = [
    job.input_asset_id,
    job.mask_asset_id,
    job.background_asset_id,
  ].filter((id): id is string => Boolean(id));
  const assetsResult = await db.from("media_assets").select("*").in("id", ids);
  if (assetsResult.error)
    throw new AppError("INTERNAL_ERROR", { cause: assetsResult.error });
  const assets = new Map(
    (assetsResult.data ?? []).map((asset) => [asset.id, asset as MediaAsset]),
  );
  const input = assets.get(job.input_asset_id);
  if (!input) throw new AppError("ASSET_NOT_FOUND");
  return submitJobToProvider(
    db,
    resolver,
    job,
    input,
    job.mask_asset_id ? (assets.get(job.mask_asset_id) ?? null) : null,
    job.background_asset_id
      ? (assets.get(job.background_asset_id) ?? null)
      : null,
  );
}

async function outputBytes(
  output: ProviderOutput,
  maxBytes: number,
): Promise<Uint8Array> {
  if (output.bytes) {
    if (output.bytes.byteLength > maxBytes)
      throw new AppError("FILE_TOO_LARGE");
    return output.bytes;
  }
  if (!output.downloadUrl) throw new AppError("PROVIDER_REJECTED");
  const response = await fetch(output.downloadUrl);
  if (!response.ok) throw new AppError("PROVIDER_TEMPORARY_FAILURE");
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new AppError("FILE_TOO_LARGE");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new AppError("FILE_TOO_LARGE");
  return bytes;
}

export async function applyProviderResult(
  db: SupabaseClient,
  config: AppConfig,
  job: ProcessingJob,
  result: ProviderJobStatusResult,
): Promise<ProcessingJob> {
  if (result.status === "processing") {
    const percent =
      typeof result.percent === "number"
        ? Math.min(99, Math.max(0, result.percent))
        : null;
    const { data, error } = await db
      .from("processing_jobs")
      .update({
        progress_stage: result.stage ?? job.progress_stage,
        progress_percent: percent,
      })
      .eq("id", job.id)
      .eq("status", "processing")
      .select("*")
      .single();
    if (error || !data) throw new AppError("INTERNAL_ERROR", { cause: error });
    return data as ProcessingJob;
  }
  if (result.status === "cancelled")
    return transitionJobStatus(db, job.id, "processing", "cancelled", {
      provider: job.provider,
    });
  if (result.status === "failed") {
    const failed = await transitionJobStatus(
      db,
      job.id,
      "processing",
      "failed",
      { retryable: result.retryable ?? false },
    );
    await db
      .from("processing_jobs")
      .update({
        error_code: result.errorCode ?? "PROVIDER_PERMANENT_FAILURE",
        error_message: result.errorMessage ?? "Provider processing failed.",
        provider_response: result.raw ?? null,
      })
      .eq("id", job.id);
    logEvent("job_failed", {
      jobId: job.id,
      sessionId: job.session_id,
      provider: job.provider,
      operation: job.operation,
      errorCode: result.errorCode,
    });
    return failed;
  }
  if (!result.output) throw new AppError("PROVIDER_REJECTED");
  const outputId = outputAssetIdForJob(job.id);
  const outputRole: AssetRole =
    job.operation === "IMAGE_GENERATE_BACKGROUND"
      ? "generated_background"
      : [
            "IMAGE_DETECT_SUBJECT",
            "IMAGE_SEGMENT_OBJECT",
            "IMAGE_REFINE_MASK",
          ].includes(job.operation)
        ? "mask"
        : "processed_result";
  const path = generateStoragePath(
    job.session_id,
    outputId,
    outputRole,
    result.output.extension,
  );
  const bytes = await outputBytes(
    result.output,
    job.operation.startsWith("VIDEO_")
      ? config.videoMaxBytes
      : config.imageMaxBytes,
  );
  const upload = await db.storage.from("media-assets").upload(path, bytes, {
    contentType: result.output.mimeType,
    upsert: false,
  });
  const duplicateObject =
    upload.error &&
    (String((upload.error as { statusCode?: string }).statusCode) === "409" ||
      /already exists|duplicate/i.test(upload.error.message));
  if (upload.error && !duplicateObject)
    throw new AppError("STORAGE_ERROR", { cause: upload.error });
  const { data, error } = await db.rpc("finalize_job_success", {
    p_job_id: job.id,
    p_expected_status: "processing",
    p_output_asset_id: outputId,
    p_storage_path: path,
    p_filename: result.output.filename,
    p_mime_type: result.output.mimeType,
    p_extension: result.output.extension,
    p_size_bytes: bytes.byteLength,
    p_provider_response: result.raw ?? {},
  });
  if (error || !data) {
    await db.storage.from("media-assets").remove([path]);
    const { data: existing } = await db
      .from("processing_jobs")
      .select("*")
      .eq("id", job.id)
      .single();
    if (existing?.status === "completed") return existing as ProcessingJob;
    throw new AppError("INTERNAL_ERROR", { cause: error });
  }
  logEvent("job_completed", {
    jobId: job.id,
    sessionId: job.session_id,
    provider: job.provider,
    operation: job.operation,
    status: "completed",
  });
  return data as ProcessingJob;
}

export function outputAssetIdForJob(jobId: string): string {
  return jobId;
}

export async function pollJob(
  db: SupabaseClient,
  config: AppConfig,
  resolver: ProviderResolver,
  job: ProcessingJob,
): Promise<ProcessingJob> {
  if (job.status !== "processing" || !job.provider_job_id) return job;
  const result = await resolver
    .resolve(job.operation)
    .getJobStatus(job.provider_job_id, job.operation);
  return applyProviderResult(db, config, job, result);
}
