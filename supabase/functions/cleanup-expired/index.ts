import { loadConfig } from "../_shared/config.ts";
import { createAdminClient } from "../_shared/db.ts";
import { AppError } from "../_shared/errors.ts";
import {
  corsHeadersForRequest,
  jsonFailure,
  jsonSuccess,
  optionsResponse,
} from "../_shared/http.ts";
import { logEvent } from "../_shared/logger.ts";
import { requireInternalSecret } from "../_shared/security.ts";

async function handle(request: Request): Promise<Response> {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  let responseHeaders: Record<string, string> = {};
  try {
    const config = loadConfig();
    responseHeaders = corsHeadersForRequest(request, config.allowedOrigins);
    if (request.method === "OPTIONS") return optionsResponse(responseHeaders);
    if (request.method !== "POST") throw new AppError("INVALID_REQUEST");
    requireInternalSecret(request, config.internalCronSecret);
    const db = createAdminClient(config);
    const now = new Date().toISOString();
    const sessionsResult = await db
      .from("media_sessions")
      .select("id,status")
      .in("status", ["active", "deleted", "expired"])
      .lte("expires_at", now)
      .is("cleanup_completed_at", null)
      .limit(100);
    if (sessionsResult.error)
      throw new AppError("INTERNAL_ERROR", { cause: sessionsResult.error });
    let assetsDeleted = 0;
    let failedCount = 0;
    let jobsExpired = 0;
    for (const session of sessionsResult.data ?? []) {
      let sessionFailed = false;
      if (session.status === "active") {
        const expiredSession = await db
          .from("media_sessions")
          .update({ status: "expired" })
          .eq("id", session.id)
          .eq("status", "active");
        if (expiredSession.error) {
          failedCount += 1;
          continue;
        }
      }
      const assets = await db
        .from("media_assets")
        .select("id,storage_bucket,storage_path,status")
        .eq("session_id", session.id)
        .not("status", "in", "(deleted,expired)");
      if (assets.error) {
        failedCount += 1;
        continue;
      }
      for (const asset of assets.data ?? []) {
        const removed = await db.storage
          .from(asset.storage_bucket)
          .remove([asset.storage_path]);
        if (removed.error) {
          failedCount += 1;
          sessionFailed = true;
          continue;
        }
        const marked = await db
          .from("media_assets")
          .update({ status: "expired", deleted_at: now })
          .eq("id", asset.id);
        if (marked.error) {
          failedCount += 1;
          sessionFailed = true;
          continue;
        }
        assetsDeleted += 1;
      }
      const jobs = await db
        .from("processing_jobs")
        .select("id,status")
        .eq("session_id", session.id)
        .in("status", [
          "draft",
          "validating",
          "queued",
          "submitting",
          "processing",
          "postprocessing",
          "failed",
        ]);
      if (jobs.error) {
        failedCount += 1;
        continue;
      }
      for (const job of jobs.data ?? []) {
        const updated = await db
          .from("processing_jobs")
          .update({ status: "expired" })
          .eq("id", job.id)
          .eq("status", job.status);
        if (!updated.error) {
          jobsExpired += 1;
          await db.from("job_events").insert({
            job_id: job.id,
            event_type: "expired_by_cleanup",
            previous_status: job.status,
            next_status: "expired",
            payload: {},
          });
        } else {
          failedCount += 1;
          sessionFailed = true;
        }
      }
      if (!sessionFailed) {
        const completed = await db
          .from("media_sessions")
          .update({ cleanup_completed_at: now })
          .eq("id", session.id)
          .is("cleanup_completed_at", null);
        if (completed.error) failedCount += 1;
      }
    }
    const summary = {
      sessionsProcessed: sessionsResult.data?.length ?? 0,
      assetsDeleted,
      jobsExpired,
      failedCount,
    };
    logEvent("cleanup_completed", {
      requestId,
      count: summary.sessionsProcessed,
      failedCount,
    });
    return jsonSuccess(summary, requestId, 200, responseHeaders);
  } catch (error) {
    return jsonFailure(error, requestId, responseHeaders);
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
