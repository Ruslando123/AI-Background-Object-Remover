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
import { pollJob, submitQueuedJob } from "../_shared/processing.ts";
import { createProviderResolver } from "../_shared/providers/registry.ts";
import { requireInternalSecret } from "../_shared/security.ts";
import type { ProcessingJob } from "../_shared/types.ts";

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
    const resolver = createProviderResolver(config);
    const { data, error } = await db
      .from("processing_jobs")
      .select("*")
      .in("status", ["queued", "processing"])
      .order("updated_at")
      .limit(50);
    if (error) throw new AppError("INTERNAL_ERROR", { cause: error });
    let completed = 0;
    let failed = 0;
    for (const row of data ?? []) {
      try {
        const job = row as ProcessingJob;
        const result =
          job.status === "queued"
            ? await submitQueuedJob(db, resolver, job)
            : await pollJob(db, config, resolver, job);
        if (result.status === "completed") completed += 1;
        if (result.status === "failed") failed += 1;
      } catch (cause) {
        failed += 1;
        logEvent("job_poll_failed", {
          requestId,
          jobId: row.id,
          provider: row.provider,
          operation: row.operation,
          errorCode: cause instanceof AppError ? cause.code : "INTERNAL_ERROR",
        });
      }
    }
    return jsonSuccess(
      { inspected: data?.length ?? 0, completed, failed },
      requestId,
      200,
      responseHeaders,
    );
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
