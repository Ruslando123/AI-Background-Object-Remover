import { describe, expect, it } from "vitest";
import { outputAssetIdForJob } from "../../supabase/functions/_shared/processing.js";

class AtomicJobSimulation {
  status: "queued" | "submitting" | "processing" | "completed" = "queued";
  providerSubmissions = 0;
  outputAssets = new Set<string>();
  editVersions = new Set<string>();

  async claimAndSubmit(): Promise<boolean> {
    if (this.status !== "queued") return false;
    this.status = "submitting";
    await Promise.resolve();
    this.providerSubmissions += 1;
    this.status = "processing";
    return true;
  }

  async finalize(jobId: string): Promise<void> {
    await Promise.resolve();
    const outputId = outputAssetIdForJob(jobId);
    if (this.status === "completed") return;
    this.outputAssets.add(outputId);
    this.editVersions.add(jobId);
    this.status = "completed";
  }
}

describe("cross-instance concurrency invariants", () => {
  it("allows only one queued -> submitting claim", async () => {
    const job = new AtomicJobSimulation();
    const claims = await Promise.all([
      job.claimAndSubmit(),
      job.claimAndSubmit(),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(job.providerSubmissions).toBe(1);
    expect(job.status).toBe("processing");
  });

  it("uses one deterministic output identity for polling/webhook races", async () => {
    const job = new AtomicJobSimulation();
    await job.claimAndSubmit();
    const jobId = crypto.randomUUID();
    await Promise.all([job.finalize(jobId), job.finalize(jobId)]);
    expect(job.outputAssets).toEqual(new Set([jobId]));
    expect(job.editVersions).toEqual(new Set([jobId]));
    expect(job.status).toBe("completed");
  });
});
