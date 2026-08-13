import { describe, expect, it } from "vitest";
import {
  corsHeadersForRequest,
  optionsResponse,
  pathAfterVersion,
} from "../../supabase/functions/_shared/http.js";

const allowed = ["https://staging.example.com", "http://localhost:5173"];

describe("browser CORS", () => {
  it("echoes an explicitly allowed origin without enabling credentials", () => {
    const headers = corsHeadersForRequest(
      new Request("https://project.supabase.co/functions/v1/api-v1/sessions", {
        headers: { Origin: "https://staging.example.com" },
      }),
      allowed,
    );
    expect(headers["access-control-allow-origin"]).toBe(
      "https://staging.example.com",
    );
    expect(headers).not.toHaveProperty("access-control-allow-credentials");
  });

  it("rejects an origin outside the allowlist", () => {
    expect(() =>
      corsHeadersForRequest(
        new Request(
          "https://project.supabase.co/functions/v1/api-v1/sessions",
          {
            headers: { Origin: "https://denied.invalid" },
          },
        ),
        allowed,
      ),
    ).toThrowError(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });

  it("builds a browser-compatible OPTIONS response with custom headers", () => {
    const headers = corsHeadersForRequest(
      new Request("http://localhost:54321/functions/v1/api-v1/sessions", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5173" },
      }),
      allowed,
    );
    const response = optionsResponse(headers);
    expect(response.status).toBe(204);
    const allowHeaders = response.headers.get("access-control-allow-headers");
    expect(allowHeaders).toContain("x-session-id");
    expect(allowHeaders).toContain("x-session-token");
    expect(allowHeaders).toContain("idempotency-key");
    expect(allowHeaders).toContain("x-request-id");
    expect(allowHeaders).toContain("authorization");
    expect(allowHeaders).toContain("apikey");
  });
});

describe("canonical API routing", () => {
  it.each([
    ["https://ref.supabase.co/functions/v1/api-v1/jobs/abc", "/jobs/abc"],
    ["http://localhost:54321/api-v1/jobs/abc", "/jobs/abc"],
    ["https://example.test/api/v1/jobs/abc", "/jobs/abc"],
  ])("normalizes %s", (url, expected) => {
    expect(pathAfterVersion(new Request(url))).toBe(expected);
  });
});
