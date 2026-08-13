\set ON_ERROR_STOP on
insert into public.processing_jobs(
  session_id, operation, status, provider, input_asset_id, parameters,
  idempotency_key, progress_stage
)
values (
  :'session_id'::uuid, 'IMAGE_REMOVE_BACKGROUND', 'queued', 'mock',
  :'asset_id'::uuid, '{}'::jsonb, 'concurrency-' || gen_random_uuid()::text,
  'preparing_media'
)
returning id \gset
\echo :id
