import { z } from "zod";
import { JOB_OPERATIONS, type JobOperation, type MediaAsset } from "./types.ts";
import { AppError } from "./errors.ts";
import type { AIProvider } from "./providers/provider.ts";

export const createJobSchema = z.object({
  operation: z.enum(JOB_OPERATIONS),
  inputAssetId: z.string().uuid(),
  maskAssetId: z.string().uuid().nullable().optional(),
  backgroundAssetId: z.string().uuid().nullable().optional(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/),
});

const needsMask = new Set<JobOperation>([
  "IMAGE_ERASE_OBJECT",
  "IMAGE_REFINE_MASK",
  "VIDEO_ERASE_OBJECT",
]);
const needsBackground = new Set<JobOperation>(["VIDEO_REPLACE_BACKGROUND"]);

export function replacementBackgroundColor(
  parameters: Record<string, unknown>,
): string | undefined {
  const value = parameters.backgroundColor;
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value))
    throw new AppError("INVALID_REQUEST", {
      message: "backgroundColor must use #RRGGBB format.",
    });
  return value.toUpperCase();
}

export function replacementBackgroundPrompt(
  parameters: Record<string, unknown>,
): string | undefined {
  const value = parameters.backgroundPrompt;
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.trim().length < 3 ||
    value.length > 500
  )
    throw new AppError("INVALID_REQUEST", {
      message: "backgroundPrompt must contain between 3 and 500 characters.",
    });
  return value.trim();
}

export function validateOperationAssets(
  operation: JobOperation,
  input: MediaAsset,
  mask: MediaAsset | null,
  background: MediaAsset | null,
  parameters: Record<string, unknown> = {},
): void {
  const expected = operation.startsWith("IMAGE_") ? "image" : "video";
  if (input.media_type !== expected)
    throw new AppError("OPERATION_NOT_SUPPORTED");
  if (needsMask.has(operation) && !mask)
    throw new AppError("INVALID_REQUEST", {
      message: "A mask asset is required.",
    });
  if (needsBackground.has(operation) && !background)
    throw new AppError("INVALID_REQUEST", {
      message: "A background asset is required.",
    });
  if (operation === "IMAGE_REPLACE_BACKGROUND") {
    const color = replacementBackgroundColor(parameters);
    const prompt = replacementBackgroundPrompt(parameters);
    const replacementCount =
      Number(Boolean(background)) +
      Number(Boolean(color)) +
      Number(Boolean(prompt));
    if (replacementCount !== 1)
      throw new AppError("INVALID_REQUEST", {
        message:
          "Provide exactly one replacement background: backgroundAssetId, parameters.backgroundColor, or parameters.backgroundPrompt.",
      });
  }
  if (
    [input, mask, background]
      .filter(Boolean)
      .some((asset) => asset?.status !== "ready")
  )
    throw new AppError("ASSET_NOT_READY");
}

export function validateProviderCapability(
  provider: AIProvider,
  operation: JobOperation,
  input: MediaAsset,
): void {
  const capabilities = provider.getCapabilities();
  if (!capabilities.operations.includes(operation))
    throw new AppError("OPERATION_NOT_SUPPORTED");
  if (!capabilities.mimeTypes.includes(input.mime_type))
    throw new AppError("UNSUPPORTED_FORMAT");
  if (input.size_bytes > capabilities.maxFileBytes)
    throw new AppError("FILE_TOO_LARGE");
  if (
    input.media_type === "video" &&
    input.duration_ms &&
    capabilities.maxVideoDurationMs &&
    input.duration_ms > capabilities.maxVideoDurationMs
  ) {
    throw new AppError("VIDEO_TOO_LONG");
  }
}
