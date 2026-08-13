# Testing

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run verify
npm run smoke
npm run smoke:staging
npm run smoke:fal
npm run verify:staging-db
```

Unit tests cover file metadata/content validation, token hashing/verification, state transitions, error mapping, provider capabilities/failures, storage paths, and filename sanitation. The in-memory integration contract covers session/upload/job/output/download, retry without upload, idempotency, webhook deduplication, ownership, expiry, and rejection cases.

The smoke test is the infrastructure integration test: it checks CORS/auth negatives, performs a real signed upload from `tests/fixtures/sample.png`, verifies private/public Storage behavior and an exact download checksum, completes a mock async job, checks idempotency, downloads the result, forces a temporary mock failure, and completes a retry without another upload. Set canonical `API_URL` to target staging. `verify:staging-db` checks tables, enums, constraints, indexes, RLS, RPC permissions, bucket privacy, and `updated_at` against the connected database.

Fal unit tests use a mockable client port around official `@fal-ai/client`; they do not make paid requests. `smoke:fal` requires `FAL_KEY`, `API_URL`, and `SUPABASE_DB_URL`, makes exactly one real request, verifies PNG alpha, and asserts the provider request ID, output asset, Storage object, and edit version in PostgreSQL.
