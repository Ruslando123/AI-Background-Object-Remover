\set ON_ERROR_STOP on
update public.media_sessions
set expires_at = now() - interval '1 minute'
where id = :'session_id'::uuid;
