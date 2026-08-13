\set ON_ERROR_STOP on
update public.media_sessions
set expires_at = now() - interval '1 minute'
where id = :'session_id'::uuid;

insert into public.media_assets(
  id, session_id, media_type, role, status, storage_bucket, storage_path,
  original_filename, mime_type, extension, size_bytes, expires_at
)
values (
  gen_random_uuid(), :'session_id'::uuid, 'image', 'temporary', 'ready',
  'missing-smoke-bucket', :'session_id' || '/' || gen_random_uuid()::text || '/temporary.png',
  'missing.png', 'image/png', 'png', 1, now() - interval '1 minute'
);

insert into public.processing_jobs(
  session_id, operation, status, provider, provider_job_id, input_asset_id,
  parameters, idempotency_key, progress_stage
)
values (
  :'session_id'::uuid, 'IMAGE_REMOVE_BACKGROUND', 'processing', 'mock',
  'mock.cleanup.fixture', :'asset_id'::uuid, '{}'::jsonb,
  'cleanup-' || gen_random_uuid()::text, 'preparing_media'
);
