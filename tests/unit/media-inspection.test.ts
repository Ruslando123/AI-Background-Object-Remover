import { describe, expect, it } from "vitest";
import {
  assertInspectedMedia,
  inspectMediaHeader,
  resolutionLimitsForMedia,
} from "../../supabase/functions/_shared/media-inspection.js";

describe("media content inspection", () => {
  it("reads a PNG signature and dimensions", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
    new DataView(bytes.buffer).setUint32(16, 1920);
    new DataView(bytes.buffer).setUint32(20, 1080);
    expect(inspectMediaHeader(bytes)).toEqual({
      mimeType: "image/png",
      width: 1920,
      height: 1080,
    });
  });
  it("rejects a MIME mismatch and excessive resolution", () => {
    expect(() =>
      assertInspectedMedia("image/jpeg", { mimeType: "image/png" }, 1920, 1080),
    ).toThrowError(expect.objectContaining({ code: "INVALID_MEDIA" }));
    expect(() =>
      assertInspectedMedia(
        "image/png",
        { mimeType: "image/png", width: 1921, height: 1080 },
        1920,
        1080,
      ),
    ).toThrowError(expect.objectContaining({ code: "RESOLUTION_TOO_HIGH" }));
  });
  it("uses independent image and video resolution limits", () => {
    const config = {
      imageMaxWidth: 8192,
      imageMaxHeight: 8192,
      videoMaxWidth: 1920,
      videoMaxHeight: 1080,
    };
    expect(resolutionLimitsForMedia("image", config)).toEqual({
      maxWidth: 8192,
      maxHeight: 8192,
    });
    expect(resolutionLimitsForMedia("video", config)).toEqual({
      maxWidth: 1920,
      maxHeight: 1080,
    });
  });
});
