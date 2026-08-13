# Hosted staging verification

No hosted result is considered verified until the commands below are actually run with real staging credentials. Never save their values in the repository.

Required environment variables:

```bash
export SUPABASE_ACCESS_TOKEN='...'
export SUPABASE_PROJECT_REF='...'
export SUPABASE_DB_PASSWORD='...'
export SUPABASE_DB_URL='postgresql://...'
export API_URL="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/api-v1"
export INTERNAL_CRON_SECRET='...'
export MOCK_AI_WEBHOOK_SECRET='...'
```

Execution sequence:

```bash
npx supabase --version
npx supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
npx supabase db push --linked
npm run verify:staging-db
npx supabase secrets set --env-file .env.staging
npx supabase functions deploy api-v1 --no-verify-jwt
npx supabase functions deploy process-jobs --no-verify-jwt
npx supabase functions deploy cleanup-expired --no-verify-jwt
API_URL="$API_URL" INTERNAL_CRON_SECRET="$INTERNAL_CRON_SECRET" MOCK_AI_WEBHOOK_SECRET="$MOCK_AI_WEBHOOK_SECRET" npm run smoke:staging
```

`.env.staging` should contain only custom function variables such as `AI_PROVIDER=mock`, `ALLOWED_ORIGINS`, `MOCK_AI_*`, limits, and `INTERNAL_CRON_SECRET`. Do not copy reserved injected `SUPABASE_*` keys into that file.

For the fal vertical slice, deploy a separate configuration with `AI_PROVIDER=fal` and `FAL_KEY` in Supabase secrets, then run exactly one paid request:

```bash
API_URL="$API_URL" SUPABASE_DB_URL="$SUPABASE_DB_URL" FAL_KEY="$FAL_KEY" npm run smoke:fal
```

The local `FAL_KEY` presence is a deliberate live-test guard; the request itself uses only the key deployed server-side.

After smoke, inspect Edge Function logs for the emitted event names without copying signed URLs or tokens. Run the scheduler SQL in `scheduler.md`, wait for at least one interval, and inspect `cron.job_run_details`.

The database verification script intentionally fails on a missing table/RPC/index/constraint, disabled RLS, frontend table/RPC privilege, public bucket, unsafe public Storage policy, or broken `updated_at` trigger.
