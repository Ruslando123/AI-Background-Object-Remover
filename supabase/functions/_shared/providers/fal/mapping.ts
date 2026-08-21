import type { JobOperation } from "../../types.ts";
import { AppError } from "../../errors.ts";

export const FAL_REMOVE_BACKGROUND_MODEL_ID = "fal-ai/birefnet/v2" as const;
export const FAL_REPLACE_BACKGROUND_MODEL_ID =
  "fal-ai/bria/background/replace" as const;
export const FAL_ERASE_OBJECT_MODEL_ID = "fal-ai/bria/eraser" as const;
export const FAL_VIDEO_REMOVE_BACKGROUND_MODEL_ID =
  "bria/video/background-removal/v3" as const;

const operationMapping: Partial<Record<JobOperation, string>> = {
  IMAGE_REMOVE_BACKGROUND: FAL_REMOVE_BACKGROUND_MODEL_ID,
  IMAGE_REPLACE_BACKGROUND: FAL_REPLACE_BACKGROUND_MODEL_ID,
  IMAGE_ERASE_OBJECT: FAL_ERASE_OBJECT_MODEL_ID,
  VIDEO_REMOVE_BACKGROUND: FAL_VIDEO_REMOVE_BACKGROUND_MODEL_ID,
};

export function falModelForOperation(operation: JobOperation): string {
  const model = operationMapping[operation];
  if (!model) throw new AppError("OPERATION_NOT_SUPPORTED");
  return model;
}

export function supportedFalOperations(): JobOperation[] {
  return Object.keys(operationMapping) as JobOperation[];
}
