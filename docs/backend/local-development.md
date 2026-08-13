# Local development

Prerequisites: Node 23+, Docker, Supabase CLI, `curl`, and `jq` for smoke tests.

```bash
cp .env.example .env.local
npm install
npm run verify
npx supabase start
npx supabase db reset
npx supabase functions serve --env-file .env.local
```

Populate `.env.local` with the URL/keys printed by `supabase status`. Keep `AI_PROVIDER=mock`. In another terminal run `npm run smoke`.

For fal development, keep `FAL_KEY` only in an ignored local secrets file or Supabase project secrets. Do not use the real provider for the general smoke suite. After deploying `AI_PROVIDER=fal`, use `npm run smoke:fal`, which submits exactly one `IMAGE_REMOVE_BACKGROUND` request.

The local canonical API URL is `http://127.0.0.1:54321/functions/v1/api-v1`. The functions do not perform FFmpeg or AI inference. Long-running video processing must remain provider-asynchronous. To invoke polling manually:

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/process-jobs \
  -H "X-Internal-Secret: $INTERNAL_CRON_SECRET"
```
