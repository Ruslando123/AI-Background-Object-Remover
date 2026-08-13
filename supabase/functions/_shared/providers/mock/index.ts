import type { AppConfig, FailureMode } from "../../config.ts";
import { ProviderError } from "../../errors.ts";
import { JOB_OPERATIONS } from "../../types.ts";
import type {
  AIProvider,
  ProviderCapabilities,
  ProviderJobInput,
  ProviderJobStatusResult,
  ProviderSubmitResult,
  ProviderWebhookEvent,
} from "../provider.ts";

const PNG_FIXTURE = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215,
  99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73,
  69, 78, 68, 174, 66, 96, 130,
]);

function encodeId(
  createdAt: number,
  mode: FailureMode,
  operation: string,
): string {
  return `mock.${createdAt}.${mode}.${operation}.${crypto.randomUUID()}`;
}

function decodeId(id: string): {
  createdAt: number;
  mode: FailureMode;
  operation: string;
} {
  const [prefix, rawTime, rawMode, operation] = id.split(".");
  if (
    prefix !== "mock" ||
    !rawTime ||
    !operation ||
    !["none", "temporary", "permanent"].includes(rawMode ?? "")
  ) {
    throw new ProviderError("PROVIDER_REJECTED");
  }
  return {
    createdAt: Number(rawTime),
    mode: rawMode as FailureMode,
    operation,
  };
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(signature)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  constructor(
    private readonly config: Pick<
      AppConfig,
      | "mockDelayMs"
      | "mockFailureMode"
      | "mockWebhookSecret"
      | "videoMaxBytes"
      | "videoMaxDurationMs"
    >,
  ) {}

  getCapabilities(): ProviderCapabilities {
    return {
      operations: [...JOB_OPERATIONS],
      mimeTypes: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "video/mp4",
        "video/quicktime",
        "video/webm",
      ],
      maxFileBytes: this.config.videoMaxBytes,
      maxVideoDurationMs: this.config.videoMaxDurationMs,
      webhook: true,
      polling: true,
      transparentVideo: true,
      maskInput: true,
      pointInput: true,
      promptBackground: true,
      temporalConsistency: true,
    };
  }

  async submitJob(input: ProviderJobInput): Promise<ProviderSubmitResult> {
    if (!this.getCapabilities().operations.includes(input.operation))
      throw new ProviderError("PROVIDER_REJECTED");
    const requestedMode = input.parameters.mockFailureMode;
    const mode =
      requestedMode === "temporary" ||
      requestedMode === "permanent" ||
      requestedMode === "none"
        ? requestedMode
        : this.config.mockFailureMode;
    return {
      providerJobId: encodeId(Date.now(), mode, input.operation),
      status: "processing",
      raw: { mock: true },
    };
  }

  async getJobStatus(providerJobId: string): Promise<ProviderJobStatusResult> {
    const parsed = decodeId(providerJobId);
    const elapsed = Date.now() - parsed.createdAt;
    if (elapsed < this.config.mockDelayMs)
      return { status: "processing", stage: "preparing_media" };
    if (parsed.mode === "temporary") {
      return {
        status: "failed",
        errorCode: "PROVIDER_TEMPORARY_FAILURE",
        errorMessage: "Simulated temporary failure.",
        retryable: true,
      };
    }
    if (parsed.mode === "permanent") {
      return {
        status: "failed",
        errorCode: "PROVIDER_PERMANENT_FAILURE",
        errorMessage: "Simulated permanent failure.",
        retryable: false,
      };
    }
    const isVideo = parsed.operation.startsWith("VIDEO_");
    return {
      status: "completed",
      stage: "completed",
      percent: 100,
      output: isVideo
        ? {
            bytes: new TextEncoder().encode("mock-video-fixture"),
            mimeType: "video/mp4",
            extension: "mp4",
            filename: "result.mp4",
          }
        : {
            bytes: PNG_FIXTURE,
            mimeType: "image/png",
            extension: "png",
            filename: "result.png",
          },
      raw: { mock: true },
    };
  }

  async cancelJob(providerJobId: string): Promise<void> {
    decodeId(providerJobId);
  }

  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<boolean> {
    if (!this.config.mockWebhookSecret) return false;
    const actual = headers["x-mock-signature"] ?? "";
    const expected = await hmacHex(this.config.mockWebhookSecret, rawBody);
    if (actual.length !== expected.length) return false;
    let mismatch = 0;
    for (let index = 0; index < actual.length; index += 1)
      mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
    return mismatch === 0;
  }

  async parseWebhook(rawBody: string): Promise<ProviderWebhookEvent> {
    const value = JSON.parse(rawBody) as ProviderWebhookEvent;
    if (!value.externalEventId || !value.providerJobId || !value.result?.status)
      throw new ProviderError("PROVIDER_REJECTED");
    return value;
  }
}
