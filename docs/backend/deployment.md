# Deployment

1. Run `npx supabase --version`, export `SUPABASE_ACCESS_TOKEN`, then link with `npx supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"`.
2. Apply migrations with `npx supabase db push --linked` and run `npm run verify:staging-db` using a temporary `SUPABASE_DB_URL` environment value.
3. Set variables from `.env.example` using `npx supabase secrets set --env-file .env.staging`; `.env.staging` is ignored and must never be committed.
4. Deploy with `npx supabase functions deploy api-v1 --no-verify-jwt`, then repeat for `process-jobs` and `cleanup-expired`.
5. Configure the scheduler using `scheduler.md`; endpoint deployment alone is not scheduling.
6. Run `API_URL="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/api-v1" npm run smoke:staging`.
7. Configure a real provider webhook only after its adapter exists. Its canonical path will be `/functions/v1/api-v1/webhooks/{provider}`.

Required secrets: injected `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; `AI_PROVIDER`; `FAL_KEY` when `AI_PROVIDER=fal`; `MOCK_AI_WEBHOOK_SECRET` only for mock webhook tests; and `INTERNAL_CRON_SECRET`. Limits/TTLs are config variables listed in `.env.example`. Never expose `FAL_KEY` to frontend code, responses, logs, or database provider payloads.

Use database backups, log/metric export, scheduler retry policies, and storage lifecycle monitoring in production. Deploy migrations before functions that depend on them.
