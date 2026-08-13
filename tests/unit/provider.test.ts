import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../supabase/functions/_shared/config.js";
import { MockAIProvider } from "../../supabase/functions/_shared/providers/mock/index.js";
import {
  ProviderRegistry,
  ProviderResolver,
} from "../../supabase/functions/_shared/providers/registry.js";
import type { MediaAsset } from "../../supabase/functions/_shared/types.js";
import { validateProviderCapability } from "../../supabase/functions/_shared/validation.js";

const baseInput = {
  backendJobId: crypto.randomUUID(),
  operation: "IMAGE_REMOVE_BACKGROUND" as const,
  input: {
    id: crypto.randomUUID(),
    mimeType: "image/png",
    signedUrl: "https://example.invalid/input",
  },
  parameters: {},
};

describe("mock provider", () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_700_000_000_000 }));
  afterEach(() => vi.useRealTimers());
  it("simulates deterministic asynchronous success", async () => {
    const provider = new MockAIProvider(
      loadConfig({ mockDelayMs: 500, mockFailureMode: "none" }),
    );
    const submitted = await provider.submitJob(baseInput);
    expect((await provider.getJobStatus(submitted.providerJobId)).status).toBe(
      "processing",
    );
    await vi.advanceTimersByTimeAsync(500);
    const result = await provider.getJobStatus(submitted.providerJobId);
    expect(result).toMatchObject({
      status: "completed",
      percent: 100,
      output: { mimeType: "image/png" },
    });
  });
  it.each(["temporary", "permanent"] as const)(
    "simulates %s failure",
    async (mode) => {
      const provider = new MockAIProvider(
        loadConfig({ mockDelayMs: 1, mockFailureMode: mode }),
      );
      const submitted = await provider.submitJob(baseInput);
      await vi.advanceTimersByTimeAsync(1);
      expect(
        await provider.getJobStatus(submitted.providerJobId),
      ).toMatchObject({ status: "failed", retryable: mode === "temporary" });
    },
  );
});

describe("provider registry and capabilities", () => {
  const provider = new MockAIProvider(loadConfig());
  it("resolves configured providers and all operations", () => {
    const resolver = new ProviderResolver(
      new ProviderRegistry().register(provider),
      "mock",
    );
    expect(resolver.resolve("VIDEO_TRACK_OBJECT").name).toBe("mock");
  });
  it("validates MIME and provider size", () => {
    const asset = {
      mime_type: "application/pdf",
      size_bytes: 1,
      media_type: "image",
      duration_ms: null,
    } as MediaAsset;
    expect(() =>
      validateProviderCapability(provider, "IMAGE_REMOVE_BACKGROUND", asset),
    ).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_FORMAT" }));
  });
});
