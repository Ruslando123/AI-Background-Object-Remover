export const ERROR_CODES = [
  "INVALID_REQUEST",
  "INVALID_SESSION",
  "SESSION_EXPIRED",
  "UNAUTHORIZED",
  "ASSET_NOT_FOUND",
  "ASSET_NOT_READY",
  "ASSET_SESSION_MISMATCH",
  "UNSUPPORTED_FORMAT",
  "FILE_TOO_LARGE",
  "VIDEO_TOO_LONG",
  "RESOLUTION_TOO_HIGH",
  "INVALID_MEDIA",
  "EMPTY_MASK",
  "SUBJECT_NOT_FOUND",
  "OPERATION_NOT_SUPPORTED",
  "PROVIDER_NOT_CONFIGURED",
  "PROVIDER_REJECTED",
  "PROVIDER_RATE_LIMIT",
  "PROVIDER_TIMEOUT",
  "PROVIDER_TEMPORARY_FAILURE",
  "PROVIDER_PERMANENT_FAILURE",
  "WEBHOOK_SIGNATURE_INVALID",
  "JOB_NOT_FOUND",
  "INVALID_JOB_TRANSITION",
  "JOB_ALREADY_COMPLETED",
  "RETRY_LIMIT_EXCEEDED",
  "UPLOAD_FAILED",
  "DOWNLOAD_FAILED",
  "STORAGE_ERROR",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const definitions: Record<
  ErrorCode,
  { status: number; message: string; retryable: boolean }
> = {
  INVALID_REQUEST: {
    status: 400,
    message: "The request is invalid.",
    retryable: false,
  },
  INVALID_SESSION: {
    status: 401,
    message: "The session is invalid.",
    retryable: false,
  },
  SESSION_EXPIRED: {
    status: 401,
    message: "The session has expired.",
    retryable: false,
  },
  UNAUTHORIZED: {
    status: 401,
    message: "Authentication is required.",
    retryable: false,
  },
  ASSET_NOT_FOUND: {
    status: 404,
    message: "The media asset was not found.",
    retryable: false,
  },
  ASSET_NOT_READY: {
    status: 409,
    message: "The media asset is not ready.",
    retryable: true,
  },
  ASSET_SESSION_MISMATCH: {
    status: 403,
    message: "The media asset is not available to this session.",
    retryable: false,
  },
  UNSUPPORTED_FORMAT: {
    status: 415,
    message: "This file format is not supported.",
    retryable: false,
  },
  FILE_TOO_LARGE: {
    status: 413,
    message: "The file exceeds the configured size limit.",
    retryable: false,
  },
  VIDEO_TOO_LONG: {
    status: 422,
    message: "The video exceeds the configured duration limit.",
    retryable: false,
  },
  RESOLUTION_TOO_HIGH: {
    status: 422,
    message: "The media resolution exceeds the configured limit.",
    retryable: false,
  },
  INVALID_MEDIA: {
    status: 422,
    message: "The uploaded media is invalid.",
    retryable: false,
  },
  EMPTY_MASK: { status: 422, message: "The mask is empty.", retryable: false },
  SUBJECT_NOT_FOUND: {
    status: 422,
    message: "No subject was found.",
    retryable: false,
  },
  OPERATION_NOT_SUPPORTED: {
    status: 422,
    message: "This operation is not supported for the media.",
    retryable: false,
  },
  PROVIDER_NOT_CONFIGURED: {
    status: 503,
    message: "The processing provider is not configured.",
    retryable: false,
  },
  PROVIDER_REJECTED: {
    status: 422,
    message: "The processing provider rejected the request.",
    retryable: false,
  },
  PROVIDER_RATE_LIMIT: {
    status: 429,
    message: "The processing provider is temporarily rate limited.",
    retryable: true,
  },
  PROVIDER_TIMEOUT: {
    status: 504,
    message: "The processing provider timed out.",
    retryable: true,
  },
  PROVIDER_TEMPORARY_FAILURE: {
    status: 503,
    message: "The processing provider is temporarily unavailable.",
    retryable: true,
  },
  PROVIDER_PERMANENT_FAILURE: {
    status: 422,
    message: "The processing provider could not complete the request.",
    retryable: false,
  },
  WEBHOOK_SIGNATURE_INVALID: {
    status: 401,
    message: "The webhook signature is invalid.",
    retryable: false,
  },
  JOB_NOT_FOUND: {
    status: 404,
    message: "The processing job was not found.",
    retryable: false,
  },
  INVALID_JOB_TRANSITION: {
    status: 409,
    message: "The requested job status transition is invalid.",
    retryable: false,
  },
  JOB_ALREADY_COMPLETED: {
    status: 409,
    message: "The job has already completed.",
    retryable: false,
  },
  RETRY_LIMIT_EXCEEDED: {
    status: 409,
    message: "The job retry limit has been reached.",
    retryable: false,
  },
  UPLOAD_FAILED: {
    status: 500,
    message: "The upload could not be completed.",
    retryable: true,
  },
  DOWNLOAD_FAILED: {
    status: 500,
    message: "The download link could not be created.",
    retryable: true,
  },
  STORAGE_ERROR: {
    status: 503,
    message: "Media storage is temporarily unavailable.",
    retryable: true,
  },
  INTERNAL_ERROR: {
    status: 500,
    message: "An unexpected error occurred.",
    retryable: true,
  },
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;
  readonly cause?: unknown;
  readonly safeMessage: string;

  constructor(
    code: ErrorCode,
    options: {
      message?: string;
      details?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    const definition = definitions[code];
    super(options.message ?? definition.message);
    this.name = "AppError";
    this.code = code;
    this.status = definition.status;
    this.retryable = definition.retryable;
    this.safeMessage = options.message ?? definition.message;
    this.details = options.details ?? {};
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export class ProviderError extends AppError {
  constructor(
    code: Extract<ErrorCode, `PROVIDER_${string}`>,
    options: ConstructorParameters<typeof AppError>[1] = {},
  ) {
    super(code, options);
    this.name = "ProviderError";
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError("INTERNAL_ERROR", { cause: error });
}
