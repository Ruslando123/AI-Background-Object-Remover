import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./errors.ts";
import { verifySessionToken } from "./security.ts";
import type { SessionContext } from "./types.ts";

export async function authenticateSession(
  request: Request,
  db: SupabaseClient,
  pathSessionId?: string,
): Promise<SessionContext> {
  const sessionId = request.headers.get("x-session-id") ?? "";
  const token = request.headers.get("x-session-token") ?? "";
  if (!sessionId || !token || (pathSessionId && pathSessionId !== sessionId))
    throw new AppError("INVALID_SESSION");
  const { data, error } = await db
    .from("media_sessions")
    .select("id,anonymous_token_hash,status,expires_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (
    error ||
    !data ||
    !(await verifySessionToken(token, data.anonymous_token_hash ?? ""))
  )
    throw new AppError("INVALID_SESSION");
  if (
    data.status !== "active" ||
    new Date(data.expires_at).getTime() <= Date.now()
  )
    throw new AppError("SESSION_EXPIRED");
  return { id: data.id, expiresAt: data.expires_at };
}
