\set ON_ERROR_STOP on
create temporary table cleanup_parameters as
select
  :'expired_session_id'::uuid as expired_session_id,
  :'expired_asset_id'::uuid as expired_asset_id,
  :'expired_storage_path'::text as expired_storage_path,
  :'active_session_id'::uuid as active_session_id;
do $$
declare p record;
begin
  select * into p from cleanup_parameters;
  if not exists (select 1 from public.media_sessions where id = p.expired_session_id and status = 'expired') then raise exception 'cleanup session not expired'; end if;
  if not exists (select 1 from public.media_assets where id = p.expired_asset_id and status = 'expired' and deleted_at is not null) then raise exception 'cleanup real asset not expired'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'media-assets' and name = p.expired_storage_path) then raise exception 'cleanup storage object still exists'; end if;
  if not exists (select 1 from public.processing_jobs where session_id = p.expired_session_id and status = 'expired') then raise exception 'cleanup job not expired'; end if;
  if not exists (select 1 from public.media_sessions where id = p.active_session_id and status = 'active') then raise exception 'cleanup changed active session'; end if;
end $$;
select 'cleanup assertions passed' as result;
