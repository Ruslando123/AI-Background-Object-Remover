import type { AppConfig } from "../../config.ts";
import { AppError, ProviderError } from "../../errors.ts";
import type {
  AIProvider,
  ProviderCapabilities,
  ProviderJobInput,
  ProviderJobStatusResult,
  ProviderSubmitResult,
} from "../provider.ts";
import { createOfficialFalClient, mapFalError } from "./client.ts";
import { falModelForOperation, supportedFalOperations } from "./mapping.ts";
import {
  replacementBackgroundColor,
  replacementBackgroundPrompt,
} from "../../validation.ts";
import type {
  FalClientPort,
  FalImage,
  FalQueueStatus,
  FalRemoveBackgroundOutput,
  FalReplaceBackgroundOutput,
  FalVideoRemoveBackgroundOutput,
} from "./types.ts";

export function mapFalStatus(status: FalQueueStatus): ProviderJobStatusResult {
  if (status.status === "IN_QUEUE")
    return { status: "processing", stage: "preparing_media" };
  if (status.status === "IN_PROGRESS")
    return { status: "processing", stage: "removing_background" };
  return { status: "processing", stage: "postprocessing" };
}

export function normalizeFalRemoveBackgroundResult(
  result: FalRemoveBackgroundOutput,
): ProviderJobStatusResult {
  const image = result.image;
  if (!image?.url) throw new ProviderError("PROVIDER_REJECTED");
  const mimeType = image.content_type || "image/png";
  if (mimeType !== "image/png") throw new ProviderError("PROVIDER_REJECTED");
  return {
    status: "completed",
    stage: "postprocessing",
    output: {
      downloadUrl: image.url,
      mimeType,
      extension: "png",
      filename: image.file_name || "result.png",
    },
    raw: {
      requestIdPresent: true,
      outputContentType: mimeType,
      outputFileSize: image.file_size ?? null,
      outputWidth: image.width ?? null,
      outputHeight: image.height ?? null,
    },
  };
}

function normalizeFalImage(image: FalImage | undefined) {
  if (!image?.url) throw new ProviderError("PROVIDER_REJECTED");
  const mimeType = image.content_type || "image/png";
  const formats: Record<string, { extension: string; filename: string }> = {
    "image/png": { extension: "png", filename: "result.png" },
    "image/jpeg": { extension: "jpg", filename: "result.jpg" },
    "image/webp": { extension: "webp", filename: "result.webp" },
  };
  const format = formats[mimeType];
  if (!format) throw new ProviderError("PROVIDER_REJECTED");
  return {
    output: {
      downloadUrl: image.url,
      mimeType,
      extension: format.extension,
      filename: image.file_name || format.filename,
    },
    metadata: {
      outputContentType: mimeType,
      outputFileSize: image.file_size ?? null,
      outputWidth: image.width ?? null,
      outputHeight: image.height ?? null,
    },
  };
}

export function normalizeFalReplaceBackgroundResult(
  result: FalReplaceBackgroundOutput,
): ProviderJobStatusResult {
  const normalized = normalizeFalImage(result.images?.[0]);
  return {
    status: "completed",
    stage: "postprocessing",
    output: normalized.output,
    raw: { requestIdPresent: true, seed: result.seed, ...normalized.metadata },
  };
}

export function normalizeFalVideoRemoveBackgroundResult(
  result: FalVideoRemoveBackgroundOutput,
): ProviderJobStatusResult {
  const video = result.video;
  if (!video?.url) throw new ProviderError("PROVIDER_REJECTED");
  const mimeType = video.content_type || "video/webm";
  const formats: Record<string, { extension: string; filename: string }> = {
    "video/webm": { extension: "webm", filename: "result.webm" },
    "video/mp4": { extension: "mp4", filename: "result.mp4" },
    "video/quicktime": { extension: "mov", filename: "result.mov" },
  };
  const format = formats[mimeType];
  if (!format) throw new ProviderError("PROVIDER_REJECTED");
  return {
    status: "completed",
    stage: "postprocessing",
    output: {
      downloadUrl: video.url,
      mimeType,
      extension: format.extension,
      filename: video.file_name || format.filename,
    },
    raw: {
      requestIdPresent: Boolean(result.request_id),
      outputContentType: mimeType,
      outputFileSize: video.file_size ?? null,
      preserveAudio: true,
    },
  };
}

export class FalAIProvider implements AIProvider {
  readonly name = "fal";
  private client: FalClientPort | undefined;

  constructor(
    private readonly config: Pick<
      AppConfig,
      "falKey" | "imageMaxBytes" | "videoMaxBytes" | "videoMaxDurationMs"
    >,
    client?: FalClientPort,
  ) {
    this.client = client;
  }

  private getClient(): FalClientPort {
    return (this.client ??= createOfficialFalClient(this.config.falKey));
  }

  getCapabilities(): ProviderCapabilities {
    return {
      operations: supportedFalOperations(),
      mimeTypes: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "video/mp4",
        "video/quicktime",
        "video/webm",
      ],
      maxFileBytes: Math.max(
        this.config.imageMaxBytes,
        this.config.videoMaxBytes,
      ),
      maxVideoDurationMs: this.config.videoMaxDurationMs,
      webhook: false,
      polling: true,
      transparentVideo: true,
      maskInput: true,
      pointInput: false,
      promptBackground: true,
      temporalConsistency: false,
    };
  }

  async submitJob(input: ProviderJobInput): Promise<ProviderSubmitResult> {
    const model = falModelForOperation(input.operation);
    try {
      const falInput =
        input.operation === "VIDEO_REMOVE_BACKGROUND"
          ? {
              video_url: input.input.signedUrl,
              output_container_and_codec: "webm_vp9" as const,
              preserve_audio: true as const,
              background_color: "Transparent" as const,
              auto_zoom: false as const,
            }
          : input.operation === "IMAGE_REPLACE_BACKGROUND"
            ? (() => {
                const color = replacementBackgroundColor(input.parameters);
                const prompt = replacementBackgroundPrompt(input.parameters);
                if (!input.background && !color && !prompt)
                  throw new AppError("INVALID_REQUEST", {
                    message:
                      "A reference background asset, backgroundColor, or backgroundPrompt is required.",
                  });
                return {
                  image_url: input.input.signedUrl,
                  ...(input.background
                    ? { ref_image_url: input.background.signedUrl }
                    : {
                        prompt:
                          prompt ??
                          `A perfectly flat uniform solid ${color} background, edge to edge, with no texture, gradient, pattern, shadows, objects, or scenery.`,
                      }),
                  negative_prompt: "" as const,
                  refine_prompt: true as const,
                  fast: true as const,
                  num_images: 1 as const,
                  sync_mode: false as const,
                };
              })()
            : input.operation === "IMAGE_ERASE_OBJECT"
              ? (() => {
                  if (!input.mask)
                    throw new AppError("INVALID_REQUEST", {
                      message: "A mask asset is required.",
                    });
                  return {
                    image_url: input.input.signedUrl,
                    mask_url: input.mask.signedUrl,
                    sync_mode: false as const,
                  };
                })()
              : { image_url: input.input.signedUrl, sync_mode: false as const };
      const submitted = await this.getClient().queue.submit(model, {
        input: falInput,
      });
      if (!submitted.request_id) throw new ProviderError("PROVIDER_REJECTED");
      return {
        providerJobId: submitted.request_id,
        status: "processing",
        raw: { model, requestIdPresent: true },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw mapFalError(error);
    }
  }

  async getJobStatus(
    providerJobId: string,
    operation: ProviderJobInput["operation"] = "IMAGE_REMOVE_BACKGROUND",
  ): Promise<ProviderJobStatusResult> {
    const model = falModelForOperation(operation);
    try {
      const status = await this.getClient().queue.status(model, {
        requestId: providerJobId,
        logs: false,
      });
      if (status.status !== "COMPLETED") return mapFalStatus(status);
      const result = await this.getClient().queue.result<
        | FalRemoveBackgroundOutput
        | FalReplaceBackgroundOutput
        | FalVideoRemoveBackgroundOutput
      >(model, {
        requestId: providerJobId,
      });
      if (operation === "VIDEO_REMOVE_BACKGROUND")
        return normalizeFalVideoRemoveBackgroundResult(
          result.data as FalVideoRemoveBackgroundOutput,
        );
      return ["IMAGE_REPLACE_BACKGROUND", "IMAGE_ERASE_OBJECT"].includes(
        operation,
      )
        ? normalizeFalReplaceBackgroundResult(
            result.data as FalReplaceBackgroundOutput,
          )
        : normalizeFalRemoveBackgroundResult(
            result.data as FalRemoveBackgroundOutput,
          );
    } catch (error) {
      const providerError =
        error instanceof ProviderError ? error : mapFalError(error);
      return {
        status: "failed",
        errorCode: providerError.code,
        errorMessage: providerError.safeMessage,
        retryable: providerError.retryable,
      };
    }
  }

  async cancelJob(
    providerJobId: string,
    operation: ProviderJobInput["operation"] = "IMAGE_REMOVE_BACKGROUND",
  ): Promise<void> {
    try {
      await this.getClient().queue.cancel(falModelForOperation(operation), {
        requestId: providerJobId,
      });
    } catch (error) {
      throw mapFalError(error);
    }
  }
}
