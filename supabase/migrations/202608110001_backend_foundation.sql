begin;

create extension if not exists pgcrypto;

create type public.session_status as enum ('active', 'expired', 'deleted');
create type public.asset_media_type as enum ('image', 'video');
create type public.asset_role as enum (
  'original', 'mask', 'uploaded_background', 'generated_background',
  'processed_result', 'thumbnail', 'temporary'
);
create type public.asset_status as enum (
  'pending_upload', 'ready', 'processing', 'failed', 'deleted', 'expired'
);
create type public.job_operation as enum (
  'IMAGE_DETECT_SUBJECT', 'IMAGE_REMOVE_BACKGROUND', 'IMAGE_REPLACE_BACKGROUND',
  'IMAGE_GENERATE_BACKGROUND', 'IMAGE_SEGMENT_OBJECT', 'IMAGE_ERASE_OBJECT',
  'IMAGE_REFINE_MASK', 'VIDEO_DETECT_SUBJECT', 'VIDEO_REMOVE_BACKGROUND',
  'VIDEO_REPLACE_BACKGROUND', 'VIDEO_TRACK_OBJECT', 'VIDEO_ERASE_OBJECT'
);
create type public.job_status as enum (
  'draft', 'validating', 'queued', 'submitting', 'processing',
  'postprocessing', 'completed', 'failed', 'cancelled', 'expired'
);

create table public.media_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_token_hash text,
  status public.session_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  deleted_at timestamptz,
  cleanup_completed_at timestamptz,
  constraint media_sessions_identity check (user_id is not null or anonymous_token_hash is not null)
);
create index media_sessions_expires_at_idx on public.media_sessions(expires_at);
create index media_sessions_user_id_idx on public.media_sessions(user_id);
create index media_sessions_cleanup_pending_idx on public.media_sessions(expires_at) where cleanup_completed_at is null;

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.media_sessions(id) on delete restrict,
  media_type public.asset_media_type not null,
  role public.asset_role not null,
  status public.asset_status not null default 'pending_upload',
  storage_bucket text not null default 'media-assets',
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  extension text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  checksum text,
  source_asset_id uuid references public.media_assets(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  deleted_at timestamptz,
  unique (storage_bucket, storage_path)
);
create index media_assets_session_id_idx on public.media_assets(session_id);
create index media_assets_source_asset_id_idx on public.media_assets(source_asset_id);
create index media_assets_expires_at_idx on public.media_assets(expires_at);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.media_sessions(id) on delete restrict,
  operation public.job_operation not null,
  status public.job_status not null default 'draft',
  provider text not null,
  provider_job_id text,
  input_asset_id uuid not null references public.media_assets(id) on delete restrict,
  mask_asset_id uuid references public.media_assets(id) on delete restrict,
  background_asset_id uuid references public.media_assets(id) on delete restrict,
  output_asset_id uuid references public.media_assets(id) on delete restrict,
  parent_job_id uuid references public.processing_jobs(id) on delete restrict,
  parameters jsonb not null default '{}'::jsonb,
  provider_request jsonb,
  provider_response jsonb,
  progress_stage text,
  progress_percent integer check (progress_percent between 0 and 100),
  error_code text,
  error_message text,
  error_details jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  unique (session_id, idempotency_key)
);
create index processing_jobs_provider_job_id_idx on public.processing_jobs(provider_job_id);
create index processing_jobs_status_idx on public.processing_jobs(status);
create index processing_jobs_session_id_idx on public.processing_jobs(session_id);

create table public.edit_versions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.media_sessions(id) on delete restrict,
  parent_version_id uuid references public.edit_versions(id) on delete restrict,
  asset_id uuid not null references public.media_assets(id) on delete restrict,
  job_id uuid references public.processing_jobs(id) on delete restrict,
  operation public.job_operation,
  parameters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index edit_versions_session_id_idx on public.edit_versions(session_id);
create unique index edit_versions_job_id_unique on public.edit_versions(job_id) where job_id is not null;

create table public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.processing_jobs(id) on delete cascade,
  event_type text not null,
  previous_status public.job_status,
  next_status public.job_status,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index job_events_job_id_created_at_idx on public.job_events(job_id, created_at);

create table public.provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  provider_job_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  unique(provider, external_event_id)
);
create index provider_webhook_events_job_idx on public.provider_webhook_events(provider_job_id);

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger media_sessions_set_updated_at before update on public.media_sessions
  for each row execute function public.set_updated_at();
create trigger media_assets_set_updated_at before update on public.media_assets
  for each row execute function public.set_updated_at();
create trigger processing_jobs_set_updated_at before update on public.processing_jobs
  for each row execute function public.set_updated_at();

create function public.validate_job_asset_sessions() returns trigger language plpgsql set search_path = '' as $$
declare asset_session uuid;
begin
  select session_id into asset_session from public.media_assets where id = new.input_asset_id;
  if asset_session is distinct from new.session_id then raise exception 'input asset session mismatch' using errcode = '23514'; end if;
  if new.mask_asset_id is not null then
    select session_id into asset_session from public.media_assets where id = new.mask_asset_id;
    if asset_session is distinct from new.session_id then raise exception 'mask asset session mismatch' using errcode = '23514'; end if;
  end if;
  if new.background_asset_id is not null then
    select session_id into asset_session from public.media_assets where id = new.background_asset_id;
    if asset_session is distinct from new.session_id then raise exception 'background asset session mismatch' using errcode = '23514'; end if;
  end if;
  if new.output_asset_id is not null then
    select session_id into asset_session from public.media_assets where id = new.output_asset_id;
    if asset_session is distinct from new.session_id then raise exception 'output asset session mismatch' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;
create trigger processing_jobs_validate_assets before insert or update of input_asset_id, mask_asset_id, background_asset_id, output_asset_id
  on public.processing_jobs for each row execute function public.validate_job_asset_sessions();

create function public.is_valid_job_transition(current_status public.job_status, next_status public.job_status)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when current_status = 'draft' and next_status = 'validating' then true
    when current_status = 'validating' and next_status in ('queued','failed') then true
    when current_status = 'queued' and next_status in ('submitting','cancelled') then true
    when current_status = 'submitting' and next_status in ('processing','failed') then true
    when current_status = 'processing' and next_status in ('postprocessing','completed','failed','cancelled') then true
    when current_status = 'postprocessing' and next_status in ('completed','failed') then true
    when current_status = 'failed' and next_status = 'queued' then true
    else false end;
$$;

create function public.transition_job_status(
  p_job_id uuid,
  p_expected_status public.job_status,
  p_next_status public.job_status,
  p_event_payload jsonb default '{}'::jsonb,
  p_progress_stage text default null,
  p_progress_percent integer default null
) returns public.processing_jobs
language plpgsql security definer set search_path = '' as $$
declare updated public.processing_jobs;
begin
  if not public.is_valid_job_transition(p_expected_status, p_next_status) then
    raise exception 'invalid job transition: % -> %', p_expected_status, p_next_status using errcode = 'P0001';
  end if;
  update public.processing_jobs
    set status = p_next_status,
        progress_stage = coalesce(p_progress_stage, progress_stage),
        progress_percent = p_progress_percent,
        started_at = case when p_next_status = 'processing' then coalesce(started_at, now()) else started_at end,
        completed_at = case when p_next_status = 'completed' then now() else completed_at end,
        cancelled_at = case when p_next_status = 'cancelled' then now() else cancelled_at end
    where id = p_job_id and status = p_expected_status
    returning * into updated;
  if updated.id is null then
    raise exception 'job not found or status changed' using errcode = 'P0002';
  end if;
  insert into public.job_events(job_id, event_type, previous_status, next_status, payload)
    values (p_job_id, 'status_transition', p_expected_status, p_next_status, coalesce(p_event_payload, '{}'::jsonb));
  return updated;
end;
$$;

create function public.finalize_job_success(
  p_job_id uuid,
  p_expected_status public.job_status,
  p_output_asset_id uuid,
  p_storage_path text,
  p_filename text,
  p_mime_type text,
  p_extension text,
  p_size_bytes bigint,
  p_provider_response jsonb default '{}'::jsonb
) returns public.processing_jobs
language plpgsql security definer set search_path = '' as $$
declare current_job public.processing_jobs; output_id uuid; updated public.processing_jobs;
begin
  select * into current_job from public.processing_jobs where id = p_job_id for update;
  if current_job.id is null then raise exception 'job not found' using errcode = 'P0002'; end if;
  if current_job.status = 'completed' and current_job.output_asset_id is not null then return current_job; end if;
  if current_job.status <> p_expected_status then raise exception 'job status changed' using errcode = 'P0002'; end if;
  if not public.is_valid_job_transition(p_expected_status, 'completed') then
    raise exception 'invalid job transition' using errcode = 'P0001';
  end if;
  insert into public.media_assets(
    id,
    session_id, media_type, role, status, storage_bucket, storage_path,
    original_filename, mime_type, extension, size_bytes, source_asset_id, metadata, expires_at
  ) select p_output_asset_id, j.session_id, a.media_type,
      case
        when j.operation = 'IMAGE_GENERATE_BACKGROUND' then 'generated_background'::public.asset_role
        when j.operation in ('IMAGE_DETECT_SUBJECT', 'IMAGE_SEGMENT_OBJECT', 'IMAGE_REFINE_MASK') then 'mask'::public.asset_role
        else 'processed_result'::public.asset_role
      end,
      'ready', 'media-assets', p_storage_path,
      p_filename, p_mime_type, p_extension, p_size_bytes, j.input_asset_id,
      jsonb_build_object('provider', j.provider, 'jobId', j.id), s.expires_at
    from public.processing_jobs j
    join public.media_assets a on a.id = j.input_asset_id
    join public.media_sessions s on s.id = j.session_id
    where j.id = p_job_id returning id into output_id;
  update public.processing_jobs set status = 'completed', output_asset_id = output_id,
    provider_response = p_provider_response, progress_stage = 'completed', progress_percent = 100,
    completed_at = now() where id = p_job_id returning * into updated;
  insert into public.edit_versions(session_id, asset_id, job_id, operation, parameters)
    values (updated.session_id, output_id, updated.id, updated.operation, updated.parameters);
  insert into public.job_events(job_id, event_type, previous_status, next_status, payload)
    values (p_job_id, 'status_transition', p_expected_status, 'completed', jsonb_build_object('outputAssetId', output_id));
  return updated;
end;
$$;

alter table public.media_sessions enable row level security;
alter table public.media_assets enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.edit_versions enable row level security;
alter table public.job_events enable row level security;
alter table public.provider_webhook_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant execute on function public.is_valid_job_transition(public.job_status, public.job_status) to service_role;
grant execute on function public.transition_job_status(uuid, public.job_status, public.job_status, jsonb, text, integer) to service_role;
grant execute on function public.finalize_job_success(uuid, public.job_status, uuid, text, text, text, text, bigint, jsonb) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'media-assets', 'media-assets', false, 524288000,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']
) on conflict (id) do update set public = false;

commit;
