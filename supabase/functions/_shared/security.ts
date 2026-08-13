import { AppError } from "./errors.ts";

const encoder = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return hex(bytes);
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return hex(new Uint8Array(digest));
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1)
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

export async function verifySessionToken(
  token: string,
  expectedHash: string,
): Promise<boolean> {
  if (!token || !expectedHash) return false;
  return constantTimeEqual(await hashSessionToken(token), expectedHash);
}

export function requireInternalSecret(
  request: Request,
  configuredSecret: string,
): void {
  const supplied = request.headers.get("x-internal-secret") ?? "";
  if (!configuredSecret || !constantTimeEqual(supplied, configuredSecret))
    throw new AppError("UNAUTHORIZED");
}
