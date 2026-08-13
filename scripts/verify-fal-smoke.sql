\set ON_ERROR_STOP on
create temporary table fal_smoke_parameters as
select :'session_id'::uuid as session_id, :'input_id'::uuid as input_id, :'job_id'::uuid as job_id;

do $$
declare p record; job public.processing_jobs;
begin
  select * into p from fal_smoke_parameters;
  select * into job from public.processing_jobs where id = p.job_id;
  if job.status <> 'completed' then raise exception 'fal job is not completed'; end if;
  if job.provider <> 'fal' or job.provider_job_id is null then raise exception 'fal provider/request ID missing'; end if;
  if job.output_asset_id is null or job.output_asset_id = p.input_id then raise exception 'fal output asset invalid'; end if;
  if (select count(*) from public.media_assets where id = job.output_asset_id and source_asset_id = p.input_id and role = 'processed_result' and status = 'ready' and mime_type = 'image/png') <> 1 then raise exception 'fal output media asset missing'; end if;
  if (select count(*) from public.edit_versions where job_id = p.job_id and asset_id = job.output_asset_id) <> 1 then raise exception 'fal edit version missing'; end if;
  if not exists (select 1 from storage.objects o join public.media_assets a on a.storage_bucket = o.bucket_id and a.storage_path = o.name where a.id = job.output_asset_id) then raise exception 'fal output storage object missing'; end if;
  if job.provider_request ? 'image_url' or job.provider_response ? 'url' then raise exception 'sensitive provider URL persisted'; end if;
end $$;

select 'fal live database assertions passed' as result;
