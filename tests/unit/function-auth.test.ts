import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { requireInternalSecret } from "../../supabase/functions/_shared/security.js";

describe("Edge Function authentication boundaries", () => {
  it("disables platform JWT checks for application-authenticated functions", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    for (const name of ["api-v1", "process-jobs", "cleanup-expired"]) {
      expect(config).toContain(`[functions.${name}]\nverify_jwt = false`);
    }
  });

  it("requires an exact non-empty cron secret", () => {
    expect(() =>
      requireInternalSecret(new Request("https://example.test"), "configured"),
    ).toThrowError(
      expect.objectContaining({ code: "UNAUTHORIZED", status: 401 }),
    );
    expect(() =>
      requireInternalSecret(
        new Request("https://example.test", {
          headers: { "X-Internal-Secret": "wrong" },
        }),
        "configured",
      ),
    ).toThrowError(expect.objectContaining({ code: "UNAUTHORIZED" }));
    expect(() =>
      requireInternalSecret(
        new Request("https://example.test", {
          headers: { "X-Internal-Secret": "configured" },
        }),
        "configured",
      ),
    ).not.toThrow();
  });

  it("keeps staging environment files out of Git", () => {
    expect(readFileSync(".gitignore", "utf8").split("\n")).toContain(
      ".env.staging",
    );
  });
});
