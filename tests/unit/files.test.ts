import { describe, expect, it } from "vitest";
import { loadConfig } from "../../supabase/functions/_shared/config.js";
import { AppError } from "../../supabase/functions/_shared/errors.js";
import {
  extensionOf,
  generateStoragePath,
  sanitizeFilename,
  validateFile,
} from "../../supabase/functions/_shared/files.js";

const config = loadConfig({ imageMaxBytes: 100, videoMaxBytes: 200 });

describe("file validation", () => {
  it("accepts matching MIME, extension, media type, and size", () => {
    expect(
      validateFile(
        {
          filename: "photo.JPEG",
          mimeType: "image/jpeg",
          sizeBytes: 99,
          mediaType: "image",
          role: "original",
        },
        config,
      ),
    ).toEqual({ filename: "photo.JPEG", extension: "jpeg" });
  });
  it.each([
    [
      {
        filename: "photo.exe",
        mimeType: "image/png",
        sizeBytes: 1,
        mediaType: "image",
        role: "original",
      },
      "UNSUPPORTED_FORMAT",
    ],
    [
      {
        filename: "photo.png",
        mimeType: "image/png",
        sizeBytes: 101,
        mediaType: "image",
        role: "original",
      },
      "FILE_TOO_LARGE",
    ],
    [
      {
        filename: "mask.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1,
        mediaType: "video",
        role: "mask",
      },
      "INVALID_MEDIA",
    ],
  ] as const)("rejects invalid inputs", (input, code) => {
    expect(() => validateFile(input, config)).toThrowError(
      expect.objectContaining({ code }),
    );
  });
});

describe("safe object names", () => {
  it("removes traversal and unsafe characters", () => {
    expect(sanitizeFilename("../../secret<script>.png")).toBe(
      "secret_script_.png",
    );
    expect(extensionOf("a.B.WEBP")).toBe("webp");
  });
  it("generates the fixed private path layout", () => {
    const session = "d9428888-122b-4d1e-a17f-cc956994b888";
    const asset = "9b2e7f44-8e6c-4a4f-ae3e-4869247e9112";
    expect(generateStoragePath(session, asset, "processed_result", "png")).toBe(
      `${session}/${asset}/result.png`,
    );
  });
  it("rejects path injection", () => {
    expect(() =>
      generateStoragePath("../bad", crypto.randomUUID(), "original", "png"),
    ).toThrow(AppError);
  });
});
