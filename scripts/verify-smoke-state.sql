\set ON_ERROR_STOP on

create temporary table smoke_parameters as
select
  :'session_id'::uuid as session_id,
  :'original_id'::uuid as original_id,
  :'success_id'::uuid as success_id,
  :'failed_id'::uuid as failed_id,
  :'retry_id'::uuid as retry_id,
  :'concurrency_id'::uuid as concurrency_id,
  :'race_id'::uuid as race_id;

do $$
declare
  p record;
  success_job public.processing_jobs;
  failed_job public.processing_jobs;
  retry_job public.processing_jobs;
  concurrent_job public.processing_jobs;
  race_job public.processing_jobs;
begin
  select * into p from smoke_parameters;
  select * into success_job from public.processing_jobs where id = p.success_id;
  select * into failed_job from public.processing_jobs where id = p.failed_id;
  select * into retry_job from public.processing_jobs where id = p.retry_id;
  select * into concurrent_job from public.processing_jobs where id = p.concurrency_id;
  select * into race_job from public.processing_jobs where id = p.race_id;

  if success_job.status <> 'completed' or success_job.provider_job_id is null or success_job.output_asset_id is null then
    raise exception 'success job is not fully completed';
  end if;
  if success_job.output_asset_id = p.original_id then raise exception 'output overwrote original'; end if;
  if (select count(*) from public.edit_versions where job_id = p.success_id) <> 1 then raise exception 'success edit version count is not one'; end if;
  if (select count(*) from public.media_assets where id = success_job.output_asset_id and source_asset_id = p.original_id and status = 'ready') <> 1 then raise exception 'success output asset invalid'; end if;
  if not exists (select 1 from public.job_events where job_id = p.success_id and next_status = 'processing') then raise exception 'processing event missing'; end if;
  if not exists (select 1 from public.job_events where job_id = p.success_id and next_status = 'completed') then raise exception 'completed event missing'; end if;

  if failed_job.status <> 'failed' or failed_job.error_code <> 'PROVIDER_TEMPORARY_FAILURE' then raise exception 'failed parent changed unexpectedly'; end if;
  if retry_job.parent_job_id <> p.failed_id or retry_job.attempt_count <> failed_job.attempt_count + 1 or retry_job.status <> 'completed' then raise exception 'retry relationship/state invalid'; end if;
  if (select count(*) from public.edit_versions where job_id = p.retry_id) <> 1 then raise exception 'retry edit version count is not one'; end if;

  if concurrent_job.status <> 'completed' or concurrent_job.provider_job_id is null then raise exception 'concurrent job not completed'; end if;
  if (select count(*) from public.job_events where job_id = p.concurrency_id and previous_status = 'queued' and next_status = 'submitting') <> 1 then raise exception 'queued claim count is not one'; end if;
  if (select count(*) from public.media_assets where id = concurrent_job.output_asset_id) <> 1 then raise exception 'concurrent output count is not one'; end if;
  if (select count(*) from public.edit_versions where job_id = p.concurrency_id) <> 1 then raise exception 'concurrent edit version count is not one'; end if;

  if race_job.status <> 'completed' or race_job.output_asset_id is null then raise exception 'poll/webhook race job not completed'; end if;
  if (select count(*) from public.media_assets where id = race_job.output_asset_id) <> 1 then raise exception 'race output count is not one'; end if;
  if (select count(*) from public.edit_versions where job_id = p.race_id) <> 1 then raise exception 'race edit version count is not one'; end if;
  if (select count(*) from public.provider_webhook_events where external_event_id = 'smoke-race-' || p.race_id::text) <> 1 then raise exception 'webhook inbox deduplication failed'; end if;

  if not exists (select 1 from storage.objects o join public.media_assets a on a.storage_path = o.name and a.storage_bucket = o.bucket_id where a.id = p.original_id) then raise exception 'original storage object missing'; end if;
end $$;

select 'live smoke database assertions passed' as result;
