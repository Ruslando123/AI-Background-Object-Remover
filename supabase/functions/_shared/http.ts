import { z } from "zod";
import type { AppConfig } from "./config.ts";
import { AppError, toAppError } from "./errors.ts";

const baseHeaders = {
  "access-control-allow-headers":
    "authorization,apikey,content-type,idempotency-key,x-session-id,x-session-token,x-internal-secret,x-mock-signature,x-request-id",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-max-age": "86400",
  "cache-control": "no-store",
};

export function corsHeadersForRequest(
  request: Request,
  allowedOrigins: readonly string[],
): Record<string, string> {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  if (!origin) return { ...baseHeaders };
  if (!allowedOrigins.includes(origin))
    throw new AppError("UNAUTHORIZED", {
      message: "This request origin is not allowed.",
    });
  return {
    ...baseHeaders,
    "access-control-allow-origin": origin,
    vary: "Origin",
  };
}

export function jsonSuccess(
  data: unknown,
  requestId: string,
  status = 200,
  responseHeaders: Record<string, string> = baseHeaders,
): Response {
  return new Response(JSON.stringify({ data, error: null, requestId }), {
    status,
    headers: {
      ...responseHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function jsonFailure(
  error: unknown,
  requestId: string,
  responseHeaders: Record<string, string> = baseHeaders,
): Response {
  const appError = toAppError(error);
  return new Response(
    JSON.stringify({
      data: null,
      error: {
        code: appError.code,
        message: appError.safeMessage,
        retryable: appError.retryable,
        details: appError.details,
      },
      requestId,
    }),
    {
      status: appError.status,
      headers: {
        ...responseHeaders,
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}

export function optionsResponse(
  responseHeaders: Record<string, string> = baseHeaders,
): Response {
  return new Response(null, { status: 204, headers: responseHeaders });
}

export async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  config: AppConfig,
): Promise<T> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > config.maxRequestBytes)
    throw new AppError("INVALID_REQUEST", {
      message: "The request payload is too large.",
    });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > config.maxRequestBytes)
    throw new AppError("INVALID_REQUEST", {
      message: "The request payload is too large.",
    });
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AppError("INVALID_REQUEST", {
      message: "The request body must be valid JSON.",
    });
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("INVALID_REQUEST", {
      details: {
        issues: result.error.issues.map(({ path, message }) => ({
          path,
          message,
        })),
      },
    });
  }
  return result.data;
}

export function pathAfterVersion(request: Request): string {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const functionMarker = "/functions/v1/api-v1";
  const functionIndex = path.indexOf(functionMarker);
  if (functionIndex >= 0)
    return path.slice(functionIndex + functionMarker.length) || "/";
  if (path === "/api-v1" || path.startsWith("/api-v1/"))
    return path.slice("/api-v1".length) || "/";
  const marker = "/api/v1";
  const index = path.indexOf(marker);
  if (index >= 0) return path.slice(index + marker.length) || "/";
  return path || "/";
}
