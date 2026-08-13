import { describe, expect, it } from "vitest";
import {
  replacementBackgroundColor,
  validateOperationAssets,
} from "../../supabase/functions/_shared/validation.js";
import type { MediaAsset } from "../../supabase/functions/_shared/types.js";

const image = {
  id: crypto.randomUUID(),
  session_id: crypto.randomUUID(),
  media_type: "image",
  role: "original",
  status: "ready",
  storage_bucket: "media-assets",
  storage_path: "source.png",
  original_filename: "source.png",
  mime_type: "image/png",
  extension: "png",
  size_bytes: 100,
  width: 10,
  height: 10,
  duration_ms: null,
  source_asset_id: null,
  metadata: {},
  expires_at: new Date(Date.now() + 60_000).toISOString(),
} satisfies MediaAsset;

describe("replace-background validation", () => {
  it("normalizes a valid background color", () => {
    expect(replacementBackgroundColor({ backgroundColor: "#12abEF" })).toBe(
      "#12ABEF",
    );
  });

  it("accepts exactly one of a background asset or color", () => {
    expect(() =>
      validateOperationAssets("IMAGE_REPLACE_BACKGROUND", image, null, null, {
        backgroundColor: "#FFFFFF",
      }),
    ).not.toThrow();
    expect(() =>
      validateOperationAssets("IMAGE_REPLACE_BACKGROUND", image, null, {
        ...image,
        id: crypto.randomUUID(),
        role: "uploaded_background",
      }),
    ).not.toThrow();
  });

  it("rejects missing, invalid, and ambiguous replacement backgrounds", () => {
    expect(() =>
      validateOperationAssets("IMAGE_REPLACE_BACKGROUND", image, null, null),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
    expect(() =>
      validateOperationAssets("IMAGE_REPLACE_BACKGROUND", image, null, null, {
        backgroundColor: "red",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
    expect(() =>
      validateOperationAssets(
        "IMAGE_REPLACE_BACKGROUND",
        image,
        null,
        { ...image, id: crypto.randomUUID(), role: "uploaded_background" },
        { backgroundColor: "#000000" },
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });
});
