\set ON_ERROR_STOP on
select provider_job_id from public.processing_jobs where id = :'job_id'::uuid;
