import { z } from "zod";
import type { AppConfig } from "./config.ts";
import { AppError } from "./errors.ts";
import type { AssetRole, MediaType } from "./types.ts";

const formats = {
  image: new Map([
    ["image/jpeg", ["jpg", "jpeg"]],
    ["image/png", ["png"]],
    ["image/webp", ["webp"]],
  ]),
  video: new Map([
    ["video/mp4", ["mp4"]],
    ["video/quicktime", ["mov"]],
    ["video/webm", ["webm"]],
  ]),
};

export const presignUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  mediaType: z.enum(["image", "video"]),
  role: z.enum(["original", "mask", "uploaded_background"]),
});

export interface FileInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  mediaType: MediaType;
  role: AssetRole;
}

export function sanitizeFilename(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "file";
  const cleaned = base
    .normalize("NFKC")
    // Control characters are deliberately stripped from untrusted filenames.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
  return (cleaned || "file").slice(0, 255);
}

export function extensionOf(filename: string): string {
  const safe = sanitizeFilename(filename);
  const index = safe.lastIndexOf(".");
  return index > 0 ? safe.slice(index + 1).toLowerCase() : "";
}

export function validateFile(
  input: FileInput,
  config: AppConfig,
): { filename: string; extension: string } {
  const extension = extensionOf(input.filename);
  const allowedExtensions = formats[input.mediaType].get(
    input.mimeType.toLowerCase(),
  );
  if (!allowedExtensions || !allowedExtensions.includes(extension))
    throw new AppError("UNSUPPORTED_FORMAT");
  if (
    input.sizeBytes >
    (input.mediaType === "image" ? config.imageMaxBytes : config.videoMaxBytes)
  ) {
    throw new AppError("FILE_TOO_LARGE");
  }
  if (input.role === "mask" && input.mediaType !== "image")
    throw new AppError("INVALID_MEDIA");
  return { filename: sanitizeFilename(input.filename), extension };
}

export function generateStoragePath(
  sessionId: string,
  assetId: string,
  role: AssetRole,
  extension: string,
): string {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    !uuid.test(sessionId) ||
    !uuid.test(assetId) ||
    !/^[a-z0-9]+$/.test(extension)
  )
    throw new AppError("INVALID_REQUEST");
  const leaf: Partial<Record<AssetRole, string>> = {
    original: "original",
    mask: "mask",
    uploaded_background: "background",
    generated_background: "background",
    processed_result: "result",
    thumbnail: "thumbnail",
    temporary: "temporary",
  };
  return `${sessionId}/${assetId}/${leaf[role] ?? "asset"}.${extension}`;
}

export function supportedFormats() {
  return {
    image: [...formats.image.entries()].map(([mimeType, extensions]) => ({
      mimeType,
      extensions,
    })),
    video: [...formats.video.entries()].map(([mimeType, extensions]) => ({
      mimeType,
      extensions,
    })),
  };
}
