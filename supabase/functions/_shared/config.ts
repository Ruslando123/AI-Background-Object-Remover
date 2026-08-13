export type FailureMode = "none" | "temporary" | "permanent";

function runtimeEnv(name: string): string | undefined {
  const runtime = globalThis as unknown as {
    Deno?: { env: { get(name: string): string | undefined } };
    process?: { env: Record<string, string | undefined> };
  };
  return runtime.Deno?.env.get(name) ?? runtime.process?.env[name];
}

function positiveInt(name: string, fallback: number): number {
  const raw = runtimeEnv(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer`);
  return value;
}

export interface AppConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  provider: string;
  falKey: string;
  mockDelayMs: number;
  mockFailureMode: FailureMode;
  mockWebhookSecret: string;
  imageMaxBytes: number;
  imageMaxWidth: number;
  imageMaxHeight: number;
  videoMaxBytes: number;
  videoMaxDurationMs: number;
  videoMaxWidth: number;
  videoMaxHeight: number;
  uploadTtlSeconds: number;
  downloadTtlSeconds: number;
  sessionTtlHours: number;
  maxRequestBytes: number;
  jobMaxAttempts: number;
  jobRateLimitPerMinute: number;
  internalCronSecret: string;
  allowedOrigins: string[];
}

function commaSeparated(name: string, fallback: string): string[] {
  return (runtimeEnv(name) ?? fallback)
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const failure = runtimeEnv("MOCK_AI_FAILURE_MODE") ?? "none";
  if (!["none", "temporary", "permanent"].includes(failure)) {
    throw new Error(
      "MOCK_AI_FAILURE_MODE must be none, temporary, or permanent",
    );
  }
  return {
    supabaseUrl: runtimeEnv("SUPABASE_URL") ?? "",
    serviceRoleKey: runtimeEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    provider: runtimeEnv("AI_PROVIDER") ?? "mock",
    falKey: runtimeEnv("FAL_KEY") ?? "",
    mockDelayMs: positiveInt("MOCK_AI_DELAY_MS", 500),
    mockFailureMode: failure as FailureMode,
    mockWebhookSecret: runtimeEnv("MOCK_AI_WEBHOOK_SECRET") ?? "",
    imageMaxBytes: positiveInt("IMAGE_MAX_BYTES", 25 * 1024 * 1024),
    imageMaxWidth: positiveInt("IMAGE_MAX_WIDTH", 8192),
    imageMaxHeight: positiveInt("IMAGE_MAX_HEIGHT", 8192),
    videoMaxBytes: positiveInt("VIDEO_MAX_BYTES", 500 * 1024 * 1024),
    videoMaxDurationMs: positiveInt("VIDEO_MAX_DURATION_MS", 60_000),
    videoMaxWidth: positiveInt("VIDEO_MAX_WIDTH", 1920),
    videoMaxHeight: positiveInt("VIDEO_MAX_HEIGHT", 1080),
    uploadTtlSeconds: positiveInt("SIGNED_UPLOAD_TTL_SECONDS", 900),
    downloadTtlSeconds: positiveInt("SIGNED_DOWNLOAD_TTL_SECONDS", 300),
    sessionTtlHours: positiveInt("SESSION_TTL_HOURS", 72),
    maxRequestBytes: positiveInt("MAX_REQUEST_BYTES", 1024 * 1024),
    jobMaxAttempts: positiveInt("JOB_MAX_ATTEMPTS", 3),
    jobRateLimitPerMinute: positiveInt("JOB_RATE_LIMIT_PER_MINUTE", 20),
    internalCronSecret: runtimeEnv("INTERNAL_CRON_SECRET") ?? "",
    allowedOrigins: commaSeparated(
      "ALLOWED_ORIGINS",
      "http://localhost:3000,http://localhost:4173,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:4173,http://127.0.0.1:5173",
    ),
    ...overrides,
  };
}
