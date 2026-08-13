const allowed = new Set([
  "requestId",
  "sessionId",
  "jobId",
  "provider",
  "operation",
  "status",
  "durationMs",
  "errorCode",
  "count",
  "failedCount",
]);

export function logEvent(
  event: string,
  context: Record<string, unknown> = {},
): void {
  const safe: Record<string, unknown> = {
    event,
    timestamp: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(context))
    if (allowed.has(key) && value !== undefined) safe[key] = value;
  console.log(JSON.stringify(safe));
}
