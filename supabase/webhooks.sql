-- =====================================================================
-- Database Webhook -> Edge Function "send-push" (notifikasi push)
-- Jalankan SETELAH schema.sql dan setelah function di-deploy.
-- Ganti <PROJECT_REF> dan <WEBHOOK_SECRET> (samakan dengan secret WEBHOOK_SECRET di function).
-- =====================================================================

create trigger push_chat_messages
  after insert on public.chat_messages
  for each row execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );

create trigger push_memberships
  after insert or update on public.memberships
  for each row execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );

create trigger push_payments
  after insert or update on public.payments
  for each row execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );
