import { AppError } from "./errors.ts";
import type { AppConfig } from "./config.ts";
import type { MediaType } from "./types.ts";

export interface InspectedMedia {
  mimeType: string;
  width?: number;
  height?: number;
}

export function resolutionLimitsForMedia(
  mediaType: MediaType,
  config: Pick<
    AppConfig,
    "imageMaxWidth" | "imageMaxHeight" | "videoMaxWidth" | "videoMaxHeight"
  >,
): { maxWidth: number; maxHeight: number } {
  return mediaType === "image"
    ? { maxWidth: config.imageMaxWidth, maxHeight: config.imageMaxHeight }
    : { maxWidth: config.videoMaxWidth, maxHeight: config.videoMaxHeight };
}

function jpegSize(
  bytes: Uint8Array,
): { width: number; height: number } | undefined {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      return {
        height: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
        width: ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0),
      };
    }
    if (length < 2) break;
    offset += length + 2;
  }
  return undefined;
}

export function inspectMediaHeader(bytes: Uint8Array): InspectedMedia {
  if (bytes.length < 12) throw new AppError("INVALID_MEDIA");
  if (
    bytes[0] === 0x89 &&
    String.fromCharCode(...bytes.slice(1, 4)) === "PNG"
  ) {
    if (bytes.length < 24) throw new AppError("INVALID_MEDIA");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      mimeType: "image/png",
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const size = jpegSize(bytes);
    return { mimeType: "image/jpeg", ...size };
  }
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { mimeType: "image/webp" };
  }
  if (String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return {
      mimeType: brand.startsWith("qt") ? "video/quicktime" : "video/mp4",
    };
  }
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return { mimeType: "video/webm" };
  throw new AppError("INVALID_MEDIA");
}

export function assertInspectedMedia(
  declaredMime: string,
  inspected: InspectedMedia,
  maxWidth: number,
  maxHeight: number,
): void {
  if (declaredMime !== inspected.mimeType)
    throw new AppError("INVALID_MEDIA", {
      message: "The file content does not match its declared MIME type.",
    });
  if (
    (inspected.width && inspected.width > maxWidth) ||
    (inspected.height && inspected.height > maxHeight)
  )
    throw new AppError("RESOLUTION_TOO_HIGH");
}
