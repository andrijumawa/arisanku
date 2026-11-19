-- =====================================================================
-- ARISAN APP — Skema Supabase (jalankan di SQL Editor)
-- Login: no. telepon + password (dipetakan ke email teknis di sisi app)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. PROFILES
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  phone       text not null unique,
  full_name   text not null,
  avatar_path text,
  role        text not null default 'peserta' check (role in ('peserta','admin')),
  account_status text not null default 'menunggu'
              check (account_status in ('menunggu','disetujui','ditolak')),
  created_at  timestamptz not null default now()
);

-- Otomatis buat profil saat user mendaftar.
-- App mengirim metadata: { phone, full_name } lewat signUp(options.data)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'full_name', 'Peserta')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper admin (security definer agar tidak rekursif di RLS)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_verified()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (account_status = 'disetujui' or role = 'admin')
  );
$$;

create or replace function public.prevent_self_account_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.account_status is distinct from old.account_status and not public.is_admin() then
    raise exception 'Hanya admin yang dapat mengubah status verifikasi akun.';
  end if;
  return new;
end $$;

create trigger protect_profile_verification
  before update of account_status on public.profiles
  for each row execute function public.prevent_self_account_verification();

-- Nama peserta yang boleh dilihat semua (untuk chat, daftar pemenang)
create view public.public_profiles as
  select id, full_name from public.profiles where public.is_verified();

-- ---------------------------------------------------------------------
-- 2. GROUPS (kelompok arisan, dibuat admin)
-- ---------------------------------------------------------------------
create table public.groups (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('uang','paket')),
  name          text not null,
  description   text,
  nominal       numeric(14,0) not null check (nominal > 0),  -- iuran per periode
  durasi        int not null check (durasi > 0),             -- jumlah putaran (uang) / jumlah cicilan (paket)
  max_slots     int,                                         -- batas slot (null = bebas)
  -- khusus arisan uang
  draw_mode     text check (draw_mode in ('acak','berurutan')),
  -- khusus arisan paket
  pay_period    text check (pay_period in ('harian','mingguan','bulanan')),
  package_type  text,                                        -- 'makanan', 'barang', dll
  package_detail text,                                       -- isi paket
  -- jadwal (diatur admin)
  start_date    date,
  end_date      date,                                        -- batas akhir pembayaran
  pickup_date   date,                                        -- paket: tanggal pengambilan
  is_open       boolean not null default true,               -- masih menerima pendaftaran
  created_at    timestamptz not null default now(),
  constraint uang_needs_mode  check (type <> 'uang'  or draw_mode is not null),
  constraint paket_needs_pay  check (type <> 'paket' or (pay_period is not null and package_type is not null))
);

create table if not exists public.arisan_types (
  code text primary key,
  label text not null,
  category text not null check (category in ('uang','paket')),
  created_at timestamptz not null default now()
);

insert into public.arisan_types (code, label, category)
values
  ('uang', 'Arisan Uang', 'uang'),
  ('paket', 'Arisan Paket Lebaran', 'paket')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 3. MEMBERSHIPS (pendaftaran peserta ke kelompok)
-- ---------------------------------------------------------------------
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  slot_count  int not null default 1 check (slot_count >= 1),
  status      text not null default 'menunggu'
              check (status in ('menunggu','aktif','nonaktif','ditolak')),
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  unique (group_id, user_id)
);
create index on public.memberships (user_id);
create index on public.memberships (group_id);

-- ---------------------------------------------------------------------
-- 4. SLOTS (nomor undian per peserta di arisan uang)
-- ---------------------------------------------------------------------
create table public.slots (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  slot_no       int not null,
  unique (group_id, slot_no)
);

-- ---------------------------------------------------------------------
-- 5. ROUNDS (putaran arisan uang & pemenangnya)
-- ---------------------------------------------------------------------
create table public.rounds (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  round_no       int not null,
  winner_slot_id uuid references public.slots(id),
  winner_user_id uuid references public.profiles(id),
  pickup_date    date,                    -- tanggal pengambilan, diatur admin
  status         text not null default 'dijadwalkan'
                 check (status in ('dijadwalkan','diserahkan')),
  created_at     timestamptz not null default now(),
  unique (group_id, round_no)
);

-- ---------------------------------------------------------------------
-- 6. PAYMENTS (bukti transfer, menunggu approve admin)
-- ---------------------------------------------------------------------
create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  group_id      uuid not null references public.groups(id) on delete cascade,
  period_no     int not null check (period_no >= 1),  -- putaran/cicilan ke-
  amount        numeric(14,0) not null check (amount > 0),
  proof_path    text not null,                        -- path di bucket 'bukti-transfer'
  status        text not null default 'menunggu'
                check (status in ('menunggu','disetujui','ditolak')),
  note          text,                                 -- catatan admin (alasan ditolak)
  created_at    timestamptz not null default now(),
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz
);
create index on public.payments (membership_id);
create index on public.payments (group_id, status);

-- ---------------------------------------------------------------------
-- 7. CHAT (satu grup gabungan semua peserta)
-- ---------------------------------------------------------------------
create table public.chat_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  body        text,
  image_path  text,                                   -- path di bucket 'chat-images'
  created_at  timestamptz not null default now(),
  constraint chat_not_empty check (body is not null or image_path is not null)
);
create index on public.chat_messages (created_at desc);

-- Langganan push notification (Web Push)
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 8. FUNGSI ADMIN
-- ---------------------------------------------------------------------

-- Approve pendaftaran; untuk arisan uang otomatis membuat slot
create or replace function public.approve_membership(p_membership uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m  public.memberships;
  g  public.groups;
  cur_max int;
  i  int;
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;

  select * into m from public.memberships where id = p_membership for update;
  if m.id is null then raise exception 'Pendaftaran tidak ditemukan'; end if;
  select * into g from public.groups where id = m.group_id;

  if m.status = 'aktif' then return; end if;

  -- slot hanya dibuat sekali (aman dipanggil ulang saat mengaktifkan kembali peserta)
  if g.type = 'uang' and not exists (select 1 from public.slots where membership_id = m.id) then
    select coalesce(max(slot_no),0) into cur_max from public.slots where group_id = g.id;
    if g.max_slots is not null and cur_max + m.slot_count > g.max_slots then
      raise exception 'Slot kelompok tidak cukup';
    end if;
    for i in 1..m.slot_count loop
      insert into public.slots (group_id, membership_id, slot_no)
      values (g.id, m.id, cur_max + i);
    end loop;
  end if;

  update public.memberships
     set status = 'aktif', approved_at = now()
   where id = p_membership;
end $$;

-- Tarik putaran berikutnya (acak / berurutan)
create or replace function public.draw_next_round(p_group uuid, p_pickup date default null)
returns public.rounds language plpgsql security definer set search_path = public as $$
declare
  g       public.groups;
  next_no int;
  s       public.slots;
  r       public.rounds;
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;

  select * into g from public.groups where id = p_group and type = 'uang';
  if g.id is null then raise exception 'Kelompok arisan uang tidak ditemukan'; end if;

  select coalesce(max(round_no),0) + 1 into next_no from public.rounds where group_id = p_group;
  if next_no > g.durasi then raise exception 'Semua putaran sudah selesai'; end if;

  -- slot milik peserta aktif yang belum pernah menang
  select sl.* into s
  from public.slots sl
  join public.memberships m on m.id = sl.membership_id
  where sl.group_id = p_group
    and m.status = 'aktif'
    and not exists (select 1 from public.rounds rr where rr.winner_slot_id = sl.id)
  order by case when g.draw_mode = 'acak' then random() end,
           case when g.draw_mode = 'berurutan' then sl.slot_no end
  limit 1;

  if s.id is null then raise exception 'Tidak ada slot tersisa untuk diundi'; end if;

  insert into public.rounds (group_id, round_no, winner_slot_id, winner_user_id, pickup_date)
  select p_group, next_no, s.id, m.user_id, p_pickup
  from public.memberships m where m.id = s.membership_id
  returning * into r;

  return r;
end $$;

-- ---------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.groups             enable row level security;
alter table public.arisan_types       enable row level security;
alter table public.memberships        enable row level security;
alter table public.slots              enable row level security;
alter table public.rounds             enable row level security;
alter table public.payments           enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles
create policy "profil: lihat sendiri / admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profil: ubah nama sendiri" on public.profiles
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy "profil: admin ubah semua" on public.profiles
  for update to authenticated using (public.is_admin());

-- groups: akun terverifikasi boleh lihat; admin kelola
create policy "grup: lihat" on public.groups
  for select to authenticated using (public.is_verified());
create policy "grup: admin kelola" on public.groups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- jenis arisan
create policy "jenis arisan: lihat" on public.arisan_types
  for select to authenticated using (public.is_verified());
create policy "jenis arisan: admin kelola" on public.arisan_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- membershipscreate policy "member: lihat sendiri / admin" on public.memberships
  for select to authenticated using (public.is_admin() or (public.is_verified() and user_id = auth.uid()));
create policy "member: daftar sendiri" on public.memberships
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'menunggu'
              and public.is_verified()
              and exists (select 1 from public.groups g where g.id = group_id and g.is_open));
create policy "member: batal pendaftaran menunggu" on public.memberships
  for delete to authenticated using (public.is_verified() and user_id = auth.uid() and status = 'menunggu');
create policy "member: admin ubah" on public.memberships
  for update to authenticated using (public.is_admin());

-- slots
create policy "slot: lihat sendiri / admin" on public.slots
  for select to authenticated using (
    public.is_admin() or (public.is_verified() and exists (
      select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid())
  ));
create policy "slot: admin kelola" on public.slots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- rounds: hasil undian transparan untuk peserta terverifikasi
create policy "putaran: lihat" on public.rounds
  for select to authenticated using (public.is_verified());
create policy "putaran: admin kelola" on public.rounds
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- payments
create policy "bayar: lihat sendiri / admin" on public.payments
  for select to authenticated using (
    public.is_admin() or (public.is_verified() and exists (
      select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid())
  ));
create policy "bayar: upload sendiri" on public.payments
  for insert to authenticated with check (
    status = 'menunggu' and public.is_verified() and exists (
      select 1 from public.memberships m
      where m.id = membership_id and m.user_id = auth.uid()
        and m.group_id = payments.group_id and m.status = 'aktif')
  );
create policy "bayar: admin review" on public.payments
  for update to authenticated using (public.is_admin());

-- chat: hanya peserta aktif (atau admin) yang boleh baca/kirim
create or replace function public.can_chat()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.is_verified() and exists (
    select 1 from public.memberships where user_id = auth.uid() and status = 'aktif'
  ));
$$;

create or replace function public.chat_admin_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id order by id), '{}'::uuid[])
  from public.profiles
  where role = 'admin' and public.can_chat();
$$;
revoke all on function public.chat_admin_ids() from public;
grant execute on function public.chat_admin_ids() to authenticated;

create policy "chat: baca" on public.chat_messages
  for select to authenticated using (public.can_chat());
create policy "chat: kirim" on public.chat_messages
  for insert to authenticated with check (user_id = auth.uid() and public.can_chat());
create policy "chat: admin hapus" on public.chat_messages
  for delete to authenticated using (public.is_admin());

-- push subscriptions
create policy "push: kelola sendiri" on public.push_subscriptions
  for all to authenticated
  using (public.is_admin() or (public.is_verified() and user_id = auth.uid()))
  with check (public.is_admin() or (public.is_verified() and user_id = auth.uid()));

-- Hak akses view nama
grant select on public.public_profiles to authenticated;
grant select on public.arisan_types to authenticated;
grant insert, update, delete on public.arisan_types to authenticated;

-- ---------------------------------------------------------------------
-- 10. REALTIME (chat & notifikasi status)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.memberships;
alter publication supabase_realtime add table public.payments;
alter publication supabase_realtime add table public.profiles;

-- ---------------------------------------------------------------------
-- 11. STORAGE (bucket privat)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('bukti-transfer','bukti-transfer', false),
       ('chat-images','chat-images', false),
       ('profile-avatars','profile-avatars', false)
on conflict (id) do nothing;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'profile-avatars';

create policy "avatar: upload sendiri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-avatars'
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar: lihat sendiri" on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-avatars'
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar: ubah sendiri" on storage.objects
  for update to authenticated
  using (bucket_id = 'profile-avatars'
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'profile-avatars'
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar: hapus sendiri" on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-avatars'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- Bukti transfer: file disimpan di folder <user_id>/<nama-file>
create policy "bukti: upload ke folder sendiri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bukti-transfer' and public.is_verified()
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bukti: lihat sendiri / admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'bukti-transfer'
         and (public.is_admin() or (public.is_verified()
              and (storage.foldername(name))[1] = auth.uid()::text)));

-- Foto chat: folder <user_id>/<nama-file>, terbaca oleh anggota chat
create policy "chat-img: upload ke folder sendiri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text
              and public.can_chat());
create policy "chat-img: baca anggota chat" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-images' and public.can_chat());

-- ---------------------------------------------------------------------
-- 12. JADIKAN AKUN ANDA ADMIN (jalankan sekali setelah daftar di app)
-- ---------------------------------------------------------------------
-- update public.profiles set role = 'admin' where phone = '08xxxxxxxxxx';
