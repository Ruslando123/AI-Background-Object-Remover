import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "./config.ts";
import { AppError } from "./errors.ts";

export function createAdminClient(config: AppConfig): SupabaseClient {
  if (!config.supabaseUrl || !config.serviceRoleKey)
    throw new AppError("INTERNAL_ERROR", {
      message: "Server configuration is incomplete.",
    });
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "ai-media-backend/1.0" } },
  });
}

export function assertDb<T>(
  result: { data: T | null; error: { message: string; code?: string } | null },
  code: "INTERNAL_ERROR" | "STORAGE_ERROR" = "INTERNAL_ERROR",
): T {
  if (result.error || result.data === null)
    throw new AppError(code, { cause: result.error });
  return result.data;
}
