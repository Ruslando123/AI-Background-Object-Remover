import { ApiError, ValidationError, createFalClient } from "@fal-ai/client";
import { AppError, ProviderError } from "../../errors.ts";
import type { FalClientPort } from "./types.ts";

export function createOfficialFalClient(falKey: string): FalClientPort {
  if (!falKey) throw new AppError("PROVIDER_NOT_CONFIGURED");
  return createFalClient({ credentials: falKey }) as FalClientPort;
}

export function mapFalError(error: unknown): ProviderError {
  if (error instanceof ValidationError)
    return new ProviderError("PROVIDER_REJECTED", { cause: error });
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403)
      return new ProviderError("PROVIDER_PERMANENT_FAILURE", { cause: error });
    if (error.status === 408 || error.status === 504)
      return new ProviderError("PROVIDER_TIMEOUT", { cause: error });
    if (error.status === 429)
      return new ProviderError("PROVIDER_RATE_LIMIT", { cause: error });
    if (error.status >= 500)
      return new ProviderError("PROVIDER_TEMPORARY_FAILURE", { cause: error });
    return new ProviderError("PROVIDER_REJECTED", { cause: error });
  }
  if (error instanceof TypeError)
    return new ProviderError("PROVIDER_TEMPORARY_FAILURE", { cause: error });
  return new ProviderError("PROVIDER_PERMANENT_FAILURE", { cause: error });
}
