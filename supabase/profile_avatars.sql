-- Jalankan sekali di Supabase SQL Editor untuk menambahkan foto profil.
alter table public.profiles add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar: upload sendiri" on storage.objects;
create policy "avatar: upload sendiri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-avatars'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar: lihat sendiri" on storage.objects;
create policy "avatar: lihat sendiri" on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-avatars'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "avatar: ubah sendiri" on storage.objects;
create policy "avatar: ubah sendiri" on storage.objects
  for update to authenticated
  using (bucket_id = 'profile-avatars'
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'profile-avatars'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar: hapus sendiri" on storage.objects;
create policy "avatar: hapus sendiri" on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-avatars'
         and (storage.foldername(name))[1] = auth.uid()::text);
