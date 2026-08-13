import { describe, expect, it } from "vitest";
import {
  AppError,
  ProviderError,
  toAppError,
} from "../../supabase/functions/_shared/errors.js";

describe("error mapping", () => {
  it("maps typed errors to safe metadata", () => {
    const error = new AppError("FILE_TOO_LARGE", {
      cause: new Error("private"),
    });
    expect(error).toMatchObject({
      status: 413,
      retryable: false,
      safeMessage: "The file exceeds the configured size limit.",
    });
    expect(error.safeMessage).not.toContain("private");
  });
  it("marks temporary provider failures retryable", () => {
    expect(new ProviderError("PROVIDER_TEMPORARY_FAILURE")).toMatchObject({
      status: 503,
      retryable: true,
    });
  });
  it("hides unexpected failures", () => {
    expect(toAppError(new Error("database password"))).toMatchObject({
      code: "INTERNAL_ERROR",
      safeMessage: "An unexpected error occurred.",
    });
  });
});
