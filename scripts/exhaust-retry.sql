\set ON_ERROR_STOP on
update public.processing_jobs
set attempt_count = max_attempts - 1
where id = :'job_id'::uuid and status = 'failed';
