-- Remove chat history older than 24 hours, for both the main chat and roulette chat.
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.delete_expired_chat_messages()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.chat_messages
  where created_at < now() - interval '24 hours';

  delete from public.roulette_chat_messages
  where created_at < now() - interval '24 hours';
end;
$$;

revoke all on function public.delete_expired_chat_messages() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'delete-expired-chat-messages';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'delete-expired-chat-messages',
    '0 * * * *',
    'select public.delete_expired_chat_messages()'
  );
end;
$$;
