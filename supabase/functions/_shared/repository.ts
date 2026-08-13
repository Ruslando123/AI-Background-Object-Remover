import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./errors.ts";
import type { MediaAsset, ProcessingJob, SessionContext } from "./types.ts";

export async function ownedAsset(
  db: SupabaseClient,
  session: SessionContext,
  assetId: string,
  ready = false,
): Promise<MediaAsset> {
  const { data, error } = await db
    .from("media_assets")
    .select("*")
    .eq("id", assetId)
    .maybeSingle();
  if (error || !data) throw new AppError("ASSET_NOT_FOUND");
  if (data.session_id !== session.id) throw new AppError("ASSET_NOT_FOUND");
  if (ready && data.status !== "ready") throw new AppError("ASSET_NOT_READY");
  return data as MediaAsset;
}

export async function ownedJob(
  db: SupabaseClient,
  session: SessionContext,
  jobId: string,
): Promise<ProcessingJob> {
  const { data, error } = await db
    .from("processing_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !data || data.session_id !== session.id)
    throw new AppError("JOB_NOT_FOUND");
  return data as ProcessingJob;
}

export async function transitionJobStatus(
  db: SupabaseClient,
  jobId: string,
  expectedCurrentStatus: string,
  nextStatus: string,
  eventPayload: Record<string, unknown> = {},
  stage?: string,
  percent?: number | null,
): Promise<ProcessingJob> {
  const { data, error } = await db.rpc("transition_job_status", {
    p_job_id: jobId,
    p_expected_status: expectedCurrentStatus,
    p_next_status: nextStatus,
    p_event_payload: eventPayload,
    p_progress_stage: stage ?? null,
    p_progress_percent: percent ?? null,
  });
  if (error || !data)
    throw new AppError("INVALID_JOB_TRANSITION", { cause: error });
  return data as ProcessingJob;
}

export function publicJob(job: ProcessingJob) {
  return {
    id: job.id,
    operation: job.operation,
    status: job.status,
    progress: { stage: job.progress_stage, percent: job.progress_percent },
    resultAssetId: job.output_asset_id,
    error: job.error_code
      ? { code: job.error_code, message: job.error_message }
      : null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}
