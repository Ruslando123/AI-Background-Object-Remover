# Scheduler

`process-jobs` and `cleanup-expired` are protected HTTP endpoints; deploying them does not schedule them. The selected staging mechanism is Supabase Cron (`pg_cron`) plus `pg_net`, configured manually after deploy because `INTERNAL_CRON_SECRET` must not appear in a committed migration.

In the Supabase SQL editor, enable the Cron, `pg_net`, and Vault integrations, then store three values in Vault:

- `backend_functions_url`: `https://<project-ref>.supabase.co/functions/v1`;
- `backend_publishable_key`: the project's publishable key used by the Edge gateway;
- `backend_internal_cron_secret`: the same random value deployed as `INTERNAL_CRON_SECRET`.

Then run this SQL in the staging project:

```sql
select cron.schedule(
  'process-media-jobs-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'backend_functions_url') || '/process-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'backend_publishable_key'),
      'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'backend_internal_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'cleanup-expired-media-hourly',
  '7 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'backend_functions_url') || '/cleanup-expired',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'backend_publishable_key'),
      'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'backend_internal_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Verify configuration rather than assuming it:

```sql
select jobid, jobname, schedule, active from cron.job
where jobname in ('process-media-jobs-every-minute', 'cleanup-expired-media-hourly');

select * from cron.job_run_details
where jobid in (select jobid from cron.job where jobname like '%media%' or jobname like '%process-media%')
order by start_time desc limit 20;
```

If Vault/Cron is unavailable on the plan, use an external scheduler with the same URLs/header and keep its secret in that scheduler's encrypted secret store.
