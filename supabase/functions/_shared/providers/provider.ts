import type { JobOperation } from "../types.ts";

export interface ProviderCapabilities {
  operations: JobOperation[];
  mimeTypes: string[];
  maxFileBytes: number;
  maxVideoDurationMs: number | null;
  webhook: boolean;
  polling: boolean;
  transparentVideo: boolean;
  maskInput: boolean;
  pointInput: boolean;
  promptBackground: boolean;
  temporalConsistency: boolean;
}

export interface ProviderAssetInput {
  id: string;
  mimeType: string;
  signedUrl: string;
}

export interface ProviderJobInput {
  backendJobId: string;
  operation: JobOperation;
  input: ProviderAssetInput;
  mask?: ProviderAssetInput;
  background?: ProviderAssetInput;
  parameters: Record<string, unknown>;
}

export interface ProviderSubmitResult {
  providerJobId: string;
  status: "processing";
  raw?: Record<string, unknown>;
}

export interface ProviderOutput {
  bytes?: Uint8Array;
  downloadUrl?: string;
  mimeType: string;
  extension: string;
  filename: string;
}

export interface ProviderJobStatusResult {
  status: "processing" | "completed" | "failed" | "cancelled";
  stage?: string;
  percent?: number;
  output?: ProviderOutput;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  raw?: Record<string, unknown>;
}

export interface ProviderWebhookEvent {
  externalEventId: string;
  providerJobId: string;
  result: ProviderJobStatusResult;
}

export interface AIProvider {
  name: string;
  getCapabilities(): ProviderCapabilities;
  submitJob(input: ProviderJobInput): Promise<ProviderSubmitResult>;
  getJobStatus(
    providerJobId: string,
    operation?: JobOperation,
  ): Promise<ProviderJobStatusResult>;
  cancelJob?(providerJobId: string, operation?: JobOperation): Promise<void>;
  verifyWebhook?(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<boolean>;
  parseWebhook?(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<ProviderWebhookEvent>;
}

export const PROVIDER_OPERATION_MAP: Record<JobOperation, string> = {
  IMAGE_DETECT_SUBJECT: "detect_subject",
  IMAGE_REMOVE_BACKGROUND: "remove_background",
  IMAGE_REPLACE_BACKGROUND: "replace_background",
  IMAGE_GENERATE_BACKGROUND: "generate_background",
  IMAGE_SEGMENT_OBJECT: "segment_object",
  IMAGE_ERASE_OBJECT: "erase_object",
  IMAGE_REFINE_MASK: "refine_mask",
  VIDEO_DETECT_SUBJECT: "detect_subject_video",
  VIDEO_REMOVE_BACKGROUND: "remove_background_video",
  VIDEO_REPLACE_BACKGROUND: "replace_background_video",
  VIDEO_TRACK_OBJECT: "track_object_video",
  VIDEO_ERASE_OBJECT: "erase_object_video",
};
