# Database schema

Migration: `supabase/migrations/202608110001_backend_foundation.sql`.

| Table                     | Purpose                                    | Key constraints                                 |
| ------------------------- | ------------------------------------------ | ----------------------------------------------- |
| `media_sessions`          | Anonymous or authenticated retention scope | hashed token, expiry/status, cleanup completion |
| `media_assets`            | Originals, masks, backgrounds, outputs     | unique bucket/path; immutable output identity   |
| `processing_jobs`         | Provider orchestration state               | session/idempotency unique; progress 0–100      |
| `edit_versions`           | Non-destructive result history             | at most one version per successful job          |
| `job_events`              | Status and retry audit log                 | append-oriented job timeline                    |
| `provider_webhook_events` | Webhook inbox/deduplication                | provider/external event unique                  |

Enums match the API vocabulary: `session_status`, `asset_media_type`, `asset_role`, `asset_status`, `job_operation`, and `job_status`. Foreign-key ownership is enforced again by `validate_job_asset_sessions`. `transition_job_status` atomically compares the expected state, updates it, and appends an event. `finalize_job_success` atomically creates a distinct output asset, attaches it to the job, creates an edit version, and records completion.

All timestamps use `timestamptz`; JSON provider fields must contain metadata only, never binary data or credentials.
