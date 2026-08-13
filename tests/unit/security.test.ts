import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  createSessionToken,
  hashSessionToken,
  verifySessionToken,
} from "../../supabase/functions/_shared/security.js";

describe("session tokens", () => {
  it("creates high-entropy tokens and stores deterministic hashes", async () => {
    const first = createSessionToken();
    const second = createSessionToken();
    expect(first).toHaveLength(64);
    expect(first).not.toBe(second);
    expect(await hashSessionToken(first)).toHaveLength(64);
    expect(await verifySessionToken(first, await hashSessionToken(first))).toBe(
      true,
    );
    expect(
      await verifySessionToken(second, await hashSessionToken(first)),
    ).toBe(false);
  });
  it("compares values without early return on length mismatch", () => {
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "different")).toBe(false);
  });
});
