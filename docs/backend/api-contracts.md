# API contracts

Canonical hosted base URL: `https://<project-ref>.supabase.co/functions/v1/api-v1`. The function name itself carries API version `v1`, so clients append `/sessions`, `/jobs`, and other route paths directly. The former duplicated `/functions/v1/api-v1/api/v1` form is not canonical.

All authenticated routes require `X-Session-Id` and `X-Session-Token`. Responses use `{ data, error, requestId }`; errors contain `code`, safe `message`, `retryable`, and `details`, never a stack trace.

Browser origins are checked against `ALLOWED_ORIGINS`. Requests without an `Origin` header remain valid for CLI/server clients. CORS never enables credentials.

| Method | Path                         | Purpose                                                        |
| ------ | ---------------------------- | -------------------------------------------------------------- |
| POST   | `/sessions`                  | Create anonymous session; raw token is returned once           |
| POST   | `/uploads/presign`           | Validate metadata, reserve pending asset, issue signed upload  |
| POST   | `/assets/complete-upload`    | Check object metadata/content signature and mark ready         |
| POST   | `/jobs`                      | Idempotently validate, create, and asynchronously submit a job |
| GET    | `/jobs/{jobId}`              | Read current job and opportunistically poll provider           |
| POST   | `/jobs/{jobId}/retry`        | Create a child job reusing ready source assets                 |
| POST   | `/jobs/{jobId}/cancel`       | Idempotently cancel queued/processing jobs                     |
| GET    | `/assets/{assetId}/download` | Issue a short-lived signed download URL                        |
| DELETE | `/sessions/{sessionId}`      | Soft-delete session and schedule it for cleanup                |
| POST   | `/webhooks/{provider}`       | Verify and deduplicate provider webhook                        |
| GET    | `/capabilities`              | Expose provider operations, formats, and configured limits     |

Request/response schemas and examples are defined in `docs/backend/openapi.yaml`. A repeated `(session_id, idempotencyKey)` returns the original job rather than creating another.
