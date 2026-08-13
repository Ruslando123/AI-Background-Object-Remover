# Security

- The storage bucket is private and direct table grants are revoked; Edge Functions use the service role server-side only.
- Anonymous tokens contain 256 random bits, are returned once, SHA-256 hashed at rest, and compared in constant time.
- Every asset/job lookup checks session ownership. Foreign-session job assets are also rejected by a database trigger.
- Zod validates bodies; UUIDs, idempotency keys, payload size, MIME/extension/size, file signature, generated path, and operation/media compatibility are checked.
- The jobs endpoint applies a per-session rolling one-minute database-backed limit.
- Webhooks use raw-body provider verification and a unique inbox key before processing.
- Structured logs use an allowlist and omit tokens, keys, signed URLs, raw media, and provider inputs.
- Internal worker/cleanup functions require `X-Internal-Secret`, independently of `verify_jwt=false`.
- CORS echoes only origins in `ALLOWED_ORIGINS`, allows the documented custom headers, and never combines wildcard origins with credentials.
- Secrets live in Edge Function environment variables, never frontend bundles or committed files.
- `FAL_KEY` is passed only to an isolated server-side official fal client. The database records model/request metadata but not credentials, temporary signed input URLs, or fal result URLs.

For staging/production, set an explicit `ALLOWED_ORIGINS` list, rotate secrets, enable platform rate/WAF controls, and alert on repeated `request_failed`, webhook, storage, and cleanup failures.
