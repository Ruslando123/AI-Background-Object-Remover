import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  isTerminal,
} from "../../supabase/functions/_shared/job-state-machine.js";

describe("job state machine", () => {
  it.each([
    ["draft", "validating"],
    ["validating", "queued"],
    ["validating", "failed"],
    ["queued", "submitting"],
    ["queued", "cancelled"],
    ["submitting", "processing"],
    ["submitting", "failed"],
    ["processing", "postprocessing"],
    ["processing", "completed"],
    ["processing", "failed"],
    ["processing", "cancelled"],
    ["postprocessing", "completed"],
    ["postprocessing", "failed"],
    ["failed", "queued"],
  ] as const)("allows %s -> %s", (current, next) =>
    expect(canTransition(current, next)).toBe(true),
  );
  it("rejects and diagnoses invalid transitions", () => {
    expect(() => assertTransition("completed", "processing")).toThrowError(
      expect.objectContaining({
        code: "INVALID_JOB_TRANSITION",
        details: { current: "completed", next: "processing" },
      }),
    );
  });
  it.each(["completed", "cancelled", "expired"] as const)(
    "treats %s as terminal",
    (status) => expect(isTerminal(status)).toBe(true),
  );
});
