\set ON_ERROR_STOP on

do $$
declare
  missing text[];
begin
  select array_agg(required.name order by required.name)
    into missing
    from unnest(array[
      'media_sessions', 'media_assets', 'processing_jobs', 'edit_versions',
      'job_events', 'provider_webhook_events'
    ]) as required(name)
    where to_regclass('public.' || required.name) is null;
  if missing is not null then raise exception 'missing tables: %', missing; end if;

  select array_agg(required.name order by required.name)
    into missing
    from unnest(array[
      'transition_job_status', 'finalize_job_success', 'is_valid_job_transition'
    ]) as required(name)
    where not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = required.name
    );
  if missing is not null then raise exception 'missing RPC functions: %', missing; end if;
end $$;

do $$
declare
  table_name text;
  expected text[];
  actual text[];
begin
  foreach table_name in array array[
    'media_sessions', 'media_assets', 'processing_jobs', 'edit_versions',
    'job_events', 'provider_webhook_events'
  ] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || table_name)::regclass) then
      raise exception 'RLS disabled on %', table_name;
    end if;
    if has_table_privilege('anon', 'public.' || table_name, 'SELECT') then
      raise exception 'anon can SELECT %', table_name;
    end if;
  end loop;

  expected := array['active','expired','deleted'];
  select array_agg(e.enumlabel order by e.enumsortorder) into actual
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typname = 'session_status';
  if actual is distinct from expected then raise exception 'session_status mismatch: %', actual; end if;

  expected := array['draft','validating','queued','submitting','processing','postprocessing','completed','failed','cancelled','expired'];
  select array_agg(e.enumlabel order by e.enumsortorder) into actual
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typname = 'job_status';
  if actual is distinct from expected then raise exception 'job_status mismatch: %', actual; end if;
end $$;

do $$
declare
  function_name text;
  config text;
begin
  foreach function_name in array array[
    'transition_job_status', 'finalize_job_success', 'is_valid_job_transition'
  ] loop
    select array_to_string(p.proconfig, ',') into config
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = function_name limit 1;
    if coalesce(config, '') not like '%search_path=%' then
      raise exception 'function % has no explicit search_path', function_name;
    end if;
  end loop;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('transition_job_status','finalize_job_success','is_valid_job_transition')
      and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) then raise exception 'frontend role can execute backend RPC'; end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.media_sessions'::regclass and contype = 'p') then raise exception 'media_sessions primary key missing'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.media_assets'::regclass and contype = 'f') then raise exception 'media_assets foreign keys missing'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.processing_jobs'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%progress_percent%') then raise exception 'progress check missing'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.processing_jobs'::regclass and contype = 'u' and pg_get_constraintdef(oid) like '%session_id, idempotency_key%') then raise exception 'job idempotency unique constraint missing'; end if;
  if to_regclass('public.processing_jobs_provider_job_id_idx') is null then raise exception 'provider job index missing'; end if;
  if to_regclass('public.edit_versions_job_id_unique') is null then raise exception 'edit version uniqueness missing'; end if;
  if to_regclass('public.media_sessions_cleanup_pending_idx') is null then raise exception 'cleanup pending index missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'media_sessions' and column_name = 'cleanup_completed_at') then raise exception 'cleanup completion column missing'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('media_sessions','media_assets','processing_jobs','edit_versions','job_events','provider_webhook_events')) then raise exception 'unexpected public table policy exists'; end if;
end $$;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'media-assets' and public = false) then
    raise exception 'private media-assets bucket missing';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
      and (roles @> array['anon'::name] or roles @> array['public'::name])
      and coalesce(qual, '') like '%media-assets%'
  ) then raise exception 'public media-assets read policy exists'; end if;
end $$;

begin;
create temporary table verify_session_state on commit drop as
with inserted as (
  insert into public.media_sessions(anonymous_token_hash, expires_at)
  values ('staging-verification-only', now() + interval '5 minutes')
  returning id, updated_at
)
select * from inserted;
select pg_sleep(0.01);
update public.media_sessions s
set expires_at = s.expires_at + interval '1 minute'
from verify_session_state v
where s.id = v.id;
do $$
begin
  if (select s.updated_at <= v.updated_at from public.media_sessions s join verify_session_state v on v.id = s.id) then
    raise exception 'updated_at trigger did not advance';
  end if;
end $$;
rollback;

select 'staging database verification passed' as result;
