import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../supabase/functions/_shared/config.js";
import { AppError } from "../../supabase/functions/_shared/errors.js";
import {
  generateStoragePath,
  validateFile,
} from "../../supabase/functions/_shared/files.js";
import { assertTransition } from "../../supabase/functions/_shared/job-state-machine.js";
import { MockAIProvider } from "../../supabase/functions/_shared/providers/mock/index.js";
import {
  createSessionToken,
  hashSessionToken,
  verifySessionToken,
} from "../../supabase/functions/_shared/security.js";

type Session = { id: string; tokenHash: string; expiresAt: number };
type Asset = {
  id: string;
  sessionId: string;
  status: "pending_upload" | "ready";
  path: string;
  output: boolean;
};
type Job = {
  id: string;
  sessionId: string;
  inputId: string;
  status: "processing" | "completed" | "failed";
  providerId: string;
  outputId?: string;
  parentId?: string;
  attempt: number;
  key: string;
};

class MemoryBackend {
  sessions = new Map<string, Session>();
  assets = new Map<string, Asset>();
  jobs = new Map<string, Job>();
  events = new Set<string>();
  provider = new MockAIProvider(
    loadConfig({ mockDelayMs: 10, mockFailureMode: "none" }),
  );
  async session(ttl = 1000) {
    const id = crypto.randomUUID(),
      token = createSessionToken();
    this.sessions.set(id, {
      id,
      tokenHash: await hashSessionToken(token),
      expiresAt: Date.now() + ttl,
    });
    return { id, token };
  }
  async auth(id: string, token: string) {
    const session = this.sessions.get(id);
    if (!session || !(await verifySessionToken(token, session.tokenHash)))
      throw new AppError("INVALID_SESSION");
    if (session.expiresAt <= Date.now()) throw new AppError("SESSION_EXPIRED");
    return session;
  }
  async presign(
    sessionId: string,
    token: string,
    filename = "photo.png",
    size = 20,
  ) {
    await this.auth(sessionId, token);
    const valid = validateFile(
      {
        filename,
        mimeType: "image/png",
        sizeBytes: size,
        mediaType: "image",
        role: "original",
      },
      loadConfig({ imageMaxBytes: 100 }),
    );
    const id = crypto.randomUUID();
    const asset = {
      id,
      sessionId,
      status: "pending_upload" as const,
      path: generateStoragePath(sessionId, id, "original", valid.extension),
      output: false,
    };
    this.assets.set(id, asset);
    return asset;
  }
  complete(sessionId: string, assetId: string) {
    const asset = this.assets.get(assetId);
    if (!asset || asset.sessionId !== sessionId)
      throw new AppError("ASSET_SESSION_MISMATCH");
    asset.status = "ready";
    return asset;
  }
  async createJob(
    sessionId: string,
    token: string,
    inputId: string,
    key: string,
  ): Promise<Job> {
    await this.auth(sessionId, token);
    const duplicate = [...this.jobs.values()].find(
      (job) => job.sessionId === sessionId && job.key === key,
    );
    if (duplicate) return duplicate;
    const asset = this.assets.get(inputId);
    if (!asset || asset.sessionId !== sessionId)
      throw new AppError("ASSET_SESSION_MISMATCH");
    if (asset.status !== "ready") throw new AppError("ASSET_NOT_READY");
    const submitted = await this.provider.submitJob({
      backendJobId: crypto.randomUUID(),
      operation: "IMAGE_REMOVE_BACKGROUND",
      input: {
        id: inputId,
        mimeType: "image/png",
        signedUrl: "memory://asset",
      },
      parameters: {},
    });
    const job: Job = {
      id: crypto.randomUUID(),
      sessionId,
      inputId,
      status: "processing" as const,
      providerId: submitted.providerJobId,
      attempt: 0,
      key,
    };
    this.jobs.set(job.id, job);
    return job;
  }
  async poll(jobId: string) {
    const job = this.jobs.get(jobId)!;
    const result = await this.provider.getJobStatus(job.providerId);
    if (result.status === "completed") {
      job.status = "completed";
      const id = crypto.randomUUID();
      job.outputId = id;
      this.assets.set(id, {
        id,
        sessionId: job.sessionId,
        status: "ready",
        path: generateStoragePath(job.sessionId, id, "processed_result", "png"),
        output: true,
      });
    }
    return job;
  }
  download(sessionId: string, assetId: string) {
    const asset = this.assets.get(assetId);
    if (!asset || asset.sessionId !== sessionId)
      throw new AppError("ASSET_SESSION_MISMATCH");
    return `signed://download/${asset.id}`;
  }
  async retry(sessionId: string, token: string, parentId: string) {
    await this.auth(sessionId, token);
    const parent = this.jobs.get(parentId)!;
    if (parent.status !== "failed")
      throw new AppError("INVALID_JOB_TRANSITION");
    const child = await this.createJob(
      sessionId,
      token,
      parent.inputId,
      `retry:${parentId}:${crypto.randomUUID()}`,
    );
    child.parentId = parentId;
    child.attempt = parent.attempt + 1;
    return child;
  }
  webhook(eventId: string, jobId: string) {
    if (this.events.has(eventId)) return false;
    this.events.add(eventId);
    const job = this.jobs.get(jobId)!;
    if (!job.outputId) {
      const id = crypto.randomUUID();
      job.outputId = id;
      this.assets.set(id, {
        id,
        sessionId: job.sessionId,
        status: "ready",
        path: "result",
        output: true,
      });
    }
    return true;
  }
}

describe("anonymous backend integration contract", () => {
  it("runs upload -> job -> async completion -> versioned output -> download", async () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    const api = new MemoryBackend();
    const session = await api.session();
    const pending = await api.presign(session.id, session.token);
    expect(pending.status).toBe("pending_upload");
    expect(api.complete(session.id, pending.id).status).toBe("ready");
    const job = await api.createJob(
      session.id,
      session.token,
      pending.id,
      "client-key",
    );
    expect(job.status).toBe("processing");
    await vi.advanceTimersByTimeAsync(10);
    const completed = await api.poll(job.id);
    expect(completed.status).toBe("completed");
    expect(completed.outputId).not.toBe(pending.id);
    expect(api.download(session.id, completed.outputId!)).toContain(
      completed.outputId,
    );
    vi.useRealTimers();
  });

  it("deduplicates job keys and webhook events/output", async () => {
    const api = new MemoryBackend();
    const session = await api.session();
    const asset = api.complete(
      session.id,
      (await api.presign(session.id, session.token)).id,
    );
    const first = await api.createJob(
      session.id,
      session.token,
      asset.id,
      "same",
    );
    expect(
      (await api.createJob(session.id, session.token, asset.id, "same")).id,
    ).toBe(first.id);
    expect(api.webhook("event-1", first.id)).toBe(true);
    const output = first.outputId;
    expect(api.webhook("event-1", first.id)).toBe(false);
    expect(first.outputId).toBe(output);
  });

  it("retries a failed job without uploading the input again", async () => {
    const api = new MemoryBackend();
    const session = await api.session();
    const asset = api.complete(
      session.id,
      (await api.presign(session.id, session.token)).id,
    );
    const failed = await api.createJob(
      session.id,
      session.token,
      asset.id,
      "failed",
    );
    failed.status = "failed";
    const assetCount = api.assets.size;
    const retry = await api.retry(session.id, session.token, failed.id);
    expect(retry).toMatchObject({
      parentId: failed.id,
      inputId: asset.id,
      attempt: 1,
    });
    expect(api.assets.size).toBe(assetCount);
  });

  it("enforces ownership and expiration", async () => {
    const api = new MemoryBackend();
    const first = await api.session();
    const second = await api.session();
    const asset = await api.presign(first.id, first.token);
    expect(() => api.complete(second.id, asset.id)).toThrowError(
      expect.objectContaining({ code: "ASSET_SESSION_MISMATCH" }),
    );
    const expired = await api.session(-1);
    await expect(api.presign(expired.id, expired.token)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });

  it("rejects unsupported/oversized files and invalid transitions", async () => {
    const api = new MemoryBackend();
    const session = await api.session();
    await expect(
      api.presign(session.id, session.token, "malware.exe"),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
    await expect(
      api.presign(session.id, session.token, "large.png", 101),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(() => assertTransition("completed", "processing")).toThrowError(
      expect.objectContaining({ code: "INVALID_JOB_TRANSITION" }),
    );
  });
});
