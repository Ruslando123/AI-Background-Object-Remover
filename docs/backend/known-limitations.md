# Known limitations

- The fal.ai adapter implements live-verified `IMAGE_REMOVE_BACKGROUND` with `fal-ai/bria/background/remove` and unit-verified reference-image `IMAGE_REPLACE_BACKGROUND` with `fal-ai/bria/background/replace`. Replace-background still needs its own paid E2E smoke test; prompt-only replacement and all other real operations remain unsupported.
- Video duration and dimensions are not fully decoded by the lightweight completion header inspector; the configured provider must reject out-of-policy video and return normalized failure. Production may add a dedicated trusted media-probe service without changing API contracts.
- Supabase defines the underlying lifetime of its signed-upload token. The backend enforces its configurable application completion deadline and cleanup policy, but cannot shorten the platform token itself.
- Polling happens opportunistically on GET and through the protected `process-jobs` endpoint. It is not automatic until Supabase Cron or an external scheduler is configured; latency then depends on scheduler frequency/provider webhooks.
- Video quality and temporal consistency depend on provider support. “No flicker” is not an absolute guarantee.
- Transparent video depends on provider capability and the selected output codec/container.
- The database-backed job limiter is deliberately minimal; production should add gateway/distributed abuse controls.
