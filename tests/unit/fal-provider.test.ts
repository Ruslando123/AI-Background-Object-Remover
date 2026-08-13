import { ApiError, ValidationError } from "@fal-ai/client";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../supabase/functions/_shared/config.js";
import { mapFalError } from "../../supabase/functions/_shared/providers/fal/client.js";
import {
  FalAIProvider,
  mapFalStatus,
  normalizeFalRemoveBackgroundResult,
  normalizeFalReplaceBackgroundResult,
  normalizeFalVideoRemoveBackgroundResult,
} from "../../supabase/functions/_shared/providers/fal/index.js";
import {
  FAL_ERASE_OBJECT_MODEL_ID,
  FAL_REMOVE_BACKGROUND_MODEL_ID,
  FAL_REPLACE_BACKGROUND_MODEL_ID,
  FAL_VIDEO_REMOVE_BACKGROUND_MODEL_ID,
  falModelForOperation,
  supportedFalOperations,
} from "../../supabase/functions/_shared/providers/fal/mapping.js";
import type { FalClientPort } from "../../supabase/functions/_shared/providers/fal/types.js";

function client(
  overrides: Partial<FalClientPort["queue"]> = {},
): FalClientPort {
  return {
    queue: {
      submit: vi.fn().mockResolvedValue({ request_id: "fal-request-1" }),
      status: vi.fn().mockResolvedValue({
        status: "IN_QUEUE",
        request_id: "fal-request-1",
      }),
      result: vi.fn().mockResolvedValue({
        requestId: "fal-request-1",
        data: {
          image: {
            url: "https://fal.media/result.png",
            content_type: "image/png",
            file_name: "transparent.png",
            file_size: 123,
            width: 64,
            height: 64,
          },
        },
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    },
  };
}

const providerInput = {
  backendJobId: crypto.randomUUID(),
  operation: "IMAGE_REMOVE_BACKGROUND" as const,
  input: {
    id: crypto.randomUUID(),
    mimeType: "image/png",
    signedUrl: "https://private.example/signed-source.png",
  },
  parameters: {},
};

describe("fal operation mapping", () => {
  it("maps only the verified background vertical slices", () => {
    expect(falModelForOperation("IMAGE_REMOVE_BACKGROUND")).toBe(
      FAL_REMOVE_BACKGROUND_MODEL_ID,
    );
    expect(falModelForOperation("IMAGE_REPLACE_BACKGROUND")).toBe(
      FAL_REPLACE_BACKGROUND_MODEL_ID,
    );
    expect(falModelForOperation("IMAGE_ERASE_OBJECT")).toBe(
      FAL_ERASE_OBJECT_MODEL_ID,
    );
    expect(falModelForOperation("VIDEO_REMOVE_BACKGROUND")).toBe(
      FAL_VIDEO_REMOVE_BACKGROUND_MODEL_ID,
    );
    expect(supportedFalOperations()).toEqual([
      "IMAGE_REMOVE_BACKGROUND",
      "IMAGE_REPLACE_BACKGROUND",
      "IMAGE_ERASE_OBJECT",
      "VIDEO_REMOVE_BACKGROUND",
    ]);
  });

  it("rejects every operation without a verified schema", () => {
    expect(() => falModelForOperation("IMAGE_SEGMENT_OBJECT")).toThrowError(
      expect.objectContaining({ code: "OPERATION_NOT_SUPPORTED" }),
    );
  });
});

describe("fal status and result normalization", () => {
  it.each([
    ["IN_QUEUE", "preparing_media"],
    ["IN_PROGRESS", "removing_background"],
    ["COMPLETED", "postprocessing"],
  ] as const)("maps %s without inventing a percentage", (status, stage) => {
    expect(mapFalStatus({ status, request_id: "request" })).toEqual({
      status: "processing",
      stage,
    });
  });

  it("normalizes the documented transparent PNG output", () => {
    expect(
      normalizeFalRemoveBackgroundResult({
        image: {
          url: "https://fal.media/result.png",
          content_type: "image/png",
          file_name: "result.png",
          file_size: 100,
          width: 32,
          height: 32,
        },
      }),
    ).toMatchObject({
      status: "completed",
      stage: "postprocessing",
      output: {
        downloadUrl: "https://fal.media/result.png",
        mimeType: "image/png",
        extension: "png",
        filename: "result.png",
      },
      raw: { outputFileSize: 100, outputWidth: 32, outputHeight: 32 },
    });
  });

  it("rejects missing URLs and non-PNG output", () => {
    expect(() =>
      normalizeFalRemoveBackgroundResult({ image: { url: "" } }),
    ).toThrowError(expect.objectContaining({ code: "PROVIDER_REJECTED" }));
    expect(() =>
      normalizeFalRemoveBackgroundResult({
        image: {
          url: "https://fal.media/result.jpg",
          content_type: "image/jpeg",
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "PROVIDER_REJECTED" }));
  });

  it("normalizes the documented replace-background image list", () => {
    expect(
      normalizeFalReplaceBackgroundResult({
        images: [
          {
            url: "https://fal.media/replaced.jpg",
            content_type: "image/jpeg",
            file_name: "replaced.jpg",
          },
        ],
        seed: 42,
      }),
    ).toMatchObject({
      status: "completed",
      output: {
        downloadUrl: "https://fal.media/replaced.jpg",
        mimeType: "image/jpeg",
        extension: "jpg",
      },
      raw: { seed: 42 },
    });
  });

  it("normalizes the documented video output and preserves audio metadata", () => {
    expect(
      normalizeFalVideoRemoveBackgroundResult({
        video: {
          url: "https://fal.media/result.webm",
          content_type: "video/webm",
          file_name: "transparent.webm",
          file_size: 2048,
        },
        request_id: "bria-request-1",
      }),
    ).toMatchObject({
      status: "completed",
      output: {
        mimeType: "video/webm",
        extension: "webm",
        filename: "transparent.webm",
      },
      raw: { requestIdPresent: true, preserveAudio: true },
    });
  });
});

describe("fal error mapping", () => {
  it.each([
    [401, "PROVIDER_PERMANENT_FAILURE", false],
    [422, "PROVIDER_REJECTED", false],
    [429, "PROVIDER_RATE_LIMIT", true],
    [500, "PROVIDER_TEMPORARY_FAILURE", true],
    [504, "PROVIDER_TIMEOUT", true],
  ] as const)("maps HTTP %s", (status, code, retryable) => {
    expect(
      mapFalError(new ApiError({ message: "fal detail", status })),
    ).toMatchObject({ code, retryable });
  });

  it("maps fal validation errors to a safe rejected error", () => {
    expect(
      mapFalError(
        new ValidationError({
          message: "invalid",
          status: 422,
          body: { detail: [] },
        }),
      ),
    ).toMatchObject({ code: "PROVIDER_REJECTED", retryable: false });
  });
});

describe("FalAIProvider queue flow", () => {
  it("submits the documented input without exposing credentials", async () => {
    const falClient = client();
    const provider = new FalAIProvider(
      loadConfig({ falKey: "server-only" }),
      falClient,
    );
    await expect(provider.submitJob(providerInput)).resolves.toMatchObject({
      providerJobId: "fal-request-1",
      status: "processing",
    });
    expect(falClient.queue.submit).toHaveBeenCalledWith(
      FAL_REMOVE_BACKGROUND_MODEL_ID,
      {
        input: {
          image_url: providerInput.input.signedUrl,
          sync_mode: false,
        },
      },
    );
  });

  it("gets the documented result after queue completion", async () => {
    const falClient = client({
      status: vi.fn().mockResolvedValue({
        status: "COMPLETED",
        request_id: "fal-request-1",
      }),
    });
    const provider = new FalAIProvider(
      loadConfig({ falKey: "server-only" }),
      falClient,
    );
    await expect(provider.getJobStatus("fal-request-1")).resolves.toMatchObject(
      {
        status: "completed",
        output: { mimeType: "image/png", extension: "png" },
      },
    );
    expect(falClient.queue.result).toHaveBeenCalledWith(
      FAL_REMOVE_BACKGROUND_MODEL_ID,
      { requestId: "fal-request-1" },
    );
  });

  it("submits reference-image background replacement with the verified schema", async () => {
    const falClient = client();
    const provider = new FalAIProvider(
      loadConfig({ falKey: "server-only" }),
      falClient,
    );
    const backgroundUrl = "https://private.example/signed-background.png";
    await provider.submitJob({
      ...providerInput,
      operation: "IMAGE_REPLACE_BACKGROUND",
      background: {
        id: crypto.randomUUID(),
        mimeType: "image/png",
        signedUrl: backgroundUrl,
      },
    });
    expect(falClient.queue.submit).toHaveBeenCalledWith(
      FAL_REPLACE_BACKGROUND_MODEL_ID,
      {
        input: {
          image_url: providerInput.input.signedUrl,
          ref_image_url: backgroundUrl,
          negative_prompt: "",
          refine_prompt: true,
          fast: true,
          num_images: 1,
          sync_mode: false,
        },
      },
    );
  });

  it("requires a reference background asset", async () => {
    const provider = new FalAIProvider(
      loadConfig({ falKey: "server-only" }),
      client(),
    );
    await expect(
      provider.submitJob({
        ...providerInput,
        operation: "IMAGE_REPLACE_BACKGROUND",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("submits a validated solid-color replacement as a prompt", async () => {
    const falClient = client();
    const provider = new FalAIProvider(
      loadConfig({ falKey: "server-only" }),
      falClient,
    );
    await provider.submitJob({
      ...providerInput,
      operation: "IMAGE_REPLACE_BACKGROUND",
      parameters: { backgroundColor: "#12abEF" },
    });
    expect(falClient.queue.submit).toHaveBeenCalledWith(
      FAL_REPLACE_BACKGROUND_MODEL_ID,
      {
        input: expect.objectContaining({
          image_url: providerInput.input.signedUrl,
          prompt: expect.stringContaining("#12ABEF"),
          sync_mode: false,
          num_images: 1,
        }),
      },
    );
  });

  it("submits a text-prompt background replacement", async () => {
    const falClient = client();
    const provider = new FalAIProvider(
      loadConfig({ falKey: "server-only" }),
      falClient,
    );
    await provider.submitJob({
      ...providerInput,
      operation: "IMAGE_REPLACE_BACKGROUND",
      parameters: { backgroundPrompt: "A quiet autumn park" },
    });
    expect(falClient.queue.submit).toHaveBeenCalledWith(
      FAL_REPLACE_BACKGROUND_MODEL_ID,
      { input: expect.objectContaining({ prompt: "A quiet autumn park" }) },
    );
  });

  it("submits an object mask to the eraser model", async () => {
    const falClient = client();
    const provider = new FalAIProvider(
      loadConfig({ falKey: "server-only" }),
      falClient,
    );
    const maskUrl = "https://private.example/signed-mask.png";
    await provider.submitJob({
      ...providerInput,
      operation: "IMAGE_ERASE_OBJECT",
      mask: {
        id: crypto.randomUUID(),
        mimeType: "image/png",
        signedUrl: maskUrl,
      },
    });
    expect(falClient.queue.submit).toHaveBeenCalledWith(
      FAL_ERASE_OBJECT_MODEL_ID,
      {
        input: {
          image_url: providerInput.input.signedUrl,
          mask_url: maskUrl,
          sync_mode: false,
        },
      },
    );
  });

  it("submits video background removal through Queue API with audio preserved", async () => {
    const falClient = client();
    const provider = new FalAIProvider(
      loadConfig({ falKey: "server-only" }),
      falClient,
    );
    const videoUrl = "https://private.example/signed-source.mp4";
    await expect(
      provider.submitJob({
        ...providerInput,
        operation: "VIDEO_REMOVE_BACKGROUND",
        input: {
          id: crypto.randomUUID(),
          mimeType: "video/mp4",
          signedUrl: videoUrl,
        },
      }),
    ).resolves.toMatchObject({ providerJobId: "fal-request-1" });
    expect(falClient.queue.submit).toHaveBeenCalledWith(
      FAL_VIDEO_REMOVE_BACKGROUND_MODEL_ID,
      {
        input: {
          video_url: videoUrl,
          output_container_and_codec: "webm_vp9",
          preserve_audio: true,
          background_color: "Transparent",
          auto_zoom: false,
        },
      },
    );
  });

  it("normalizes a completed queued video result", async () => {
    const falClient = client({
      status: vi.fn().mockResolvedValue({
        status: "COMPLETED",
        request_id: "fal-request-1",
      }),
      result: vi.fn().mockResolvedValue({
        requestId: "fal-request-1",
        data: {
          video: {
            url: "https://fal.media/result.webm",
            content_type: "video/webm",
          },
          request_id: "bria-request-1",
        },
      }),
    });
    const provider = new FalAIProvider(
      loadConfig({ falKey: "server-only" }),
      falClient,
    );
    await expect(
      provider.getJobStatus("fal-request-1", "VIDEO_REMOVE_BACKGROUND"),
    ).resolves.toMatchObject({
      status: "completed",
      output: { mimeType: "video/webm", extension: "webm" },
    });
  });

  it("reports only the implemented capability", () => {
    const provider = new FalAIProvider(
      loadConfig({ falKey: "server-only" }),
      client(),
    );
    expect(provider.getCapabilities()).toMatchObject({
      operations: [
        "IMAGE_REMOVE_BACKGROUND",
        "IMAGE_REPLACE_BACKGROUND",
        "IMAGE_ERASE_OBJECT",
        "VIDEO_REMOVE_BACKGROUND",
      ],
      webhook: false,
      polling: true,
      maskInput: true,
      transparentVideo: true,
      maxVideoDurationMs: 60_000,
      promptBackground: true,
      mimeTypes: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "video/mp4",
        "video/quicktime",
        "video/webm",
      ],
    });
  });
});
