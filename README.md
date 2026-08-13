# AI Background & Object Remover

This repository contains the production-oriented Supabase backend foundation. It does not contain or modify frontend UI.

## Backend

The backend uses PostgreSQL, a private Supabase Storage bucket, and TypeScript Edge Functions. A deterministic asynchronous mock adapter is enabled by default. The only real provider is fal.ai. `IMAGE_REMOVE_BACKGROUND` is live-verified through `fal-ai/bria/background/remove`; reference-image `IMAGE_REPLACE_BACKGROUND` is implemented through `fal-ai/bria/background/replace` and awaits its dedicated live smoke test.

```bash
npm install
npm run verify
npx supabase start
npx supabase db reset
npx supabase functions serve --env-file .env.local
npm run smoke
```

Copy `.env.example` to `.env.local` and fill values printed by `supabase status`. See [local development](docs/backend/local-development.md) and the [API contracts](docs/backend/api-contracts.md).

The canonical Edge API base URL is `https://<project-ref>.supabase.co/functions/v1/api-v1`; route paths such as `/sessions` are appended once. For staging evidence and remaining credential-dependent steps, see [staging verification](docs/backend/staging-verification.md).

For a real fal.ai smoke test after deploying `AI_PROVIDER=fal` and server-side `FAL_KEY`, run `API_URL=... SUPABASE_DB_URL=... FAL_KEY=... npm run smoke:fal`. The script makes exactly one paid model request.
