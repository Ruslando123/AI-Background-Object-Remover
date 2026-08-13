export const JOB_OPERATIONS = [
  "IMAGE_DETECT_SUBJECT",
  "IMAGE_REMOVE_BACKGROUND",
  "IMAGE_REPLACE_BACKGROUND",
  "IMAGE_GENERATE_BACKGROUND",
  "IMAGE_SEGMENT_OBJECT",
  "IMAGE_ERASE_OBJECT",
  "IMAGE_REFINE_MASK",
  "VIDEO_DETECT_SUBJECT",
  "VIDEO_REMOVE_BACKGROUND",
  "VIDEO_REPLACE_BACKGROUND",
  "VIDEO_TRACK_OBJECT",
  "VIDEO_ERASE_OBJECT",
] as const;

export type JobOperation = (typeof JOB_OPERATIONS)[number];
export type JobStatus =
  | "draft"
  | "validating"
  | "queued"
  | "submitting"
  | "processing"
  | "postprocessing"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";
export type MediaType = "image" | "video";
export type AssetRole =
  | "original"
  | "mask"
  | "uploaded_background"
  | "generated_background"
  | "processed_result"
  | "thumbnail"
  | "temporary";

export const PROGRESS_STAGES = [
  "validating",
  "preparing_media",
  "detecting_subject",
  "generating_mask",
  "removing_background",
  "replacing_background",
  "generating_background",
  "tracking_object",
  "removing_object",
  "restoring_frames",
  "refining_edges",
  "postprocessing",
  "encoding",
  "uploading_result",
  "completed",
] as const;

export interface MediaAsset {
  id: string;
  session_id: string;
  media_type: MediaType;
  role: AssetRole;
  status:
    | "pending_upload"
    | "ready"
    | "processing"
    | "failed"
    | "deleted"
    | "expired";
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  extension: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  source_asset_id: string | null;
  metadata: Record<string, unknown>;
  expires_at: string;
}

export interface ProcessingJob {
  id: string;
  session_id: string;
  operation: JobOperation;
  status: JobStatus;
  provider: string;
  provider_job_id: string | null;
  input_asset_id: string;
  mask_asset_id: string | null;
  background_asset_id: string | null;
  output_asset_id: string | null;
  parent_job_id: string | null;
  parameters: Record<string, unknown>;
  provider_response: Record<string, unknown> | null;
  progress_stage: string | null;
  progress_percent: number | null;
  error_code: string | null;
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export interface SessionContext {
  id: string;
  expiresAt: string;
}
