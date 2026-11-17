-- Aktifkan Realtime untuk tabel yang dipakai aplikasi.
-- Aman dijalankan berulang kali setelah schema.sql.
do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Publication supabase_realtime tidak ditemukan';
  end if;

  foreach table_name in array array[
    'chat_messages',
    'groups',
    'memberships',
    'payments',
    'profiles',
    'rounds',
    'slots'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
