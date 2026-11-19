-- Akun yang sudah ada tetap aktif; akun baru menunggu verifikasi admin.
alter table public.profiles add column if not exists account_status text;
update public.profiles set account_status = 'disetujui' where account_status is null;
alter table public.profiles alter column account_status set default 'menunggu';
alter table public.profiles alter column account_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_account_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('menunggu','disetujui','ditolak'));
  end if;
end $$;

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

drop trigger if exists protect_profile_verification on public.profiles;
create trigger protect_profile_verification
  before update of account_status on public.profiles
  for each row execute function public.prevent_self_account_verification();

drop policy if exists "grup: lihat" on public.groups;
create policy "grup: lihat" on public.groups
  for select to authenticated using (public.is_verified());

drop policy if exists "member: daftar sendiri" on public.memberships;
create policy "member: daftar sendiri" on public.memberships
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'menunggu'
    and public.is_verified()
    and exists (select 1 from public.groups g where g.id = group_id and g.is_open)
  );

drop policy if exists "member: batal pendaftaran menunggu" on public.memberships;
create policy "member: batal pendaftaran menunggu" on public.memberships
  for delete to authenticated
  using (public.is_verified() and user_id = auth.uid() and status = 'menunggu');

drop policy if exists "member: lihat sendiri / admin" on public.memberships;
create policy "member: lihat sendiri / admin" on public.memberships
  for select to authenticated
  using (public.is_admin() or (public.is_verified() and user_id = auth.uid()));

drop policy if exists "slot: lihat sendiri / admin" on public.slots;
create policy "slot: lihat sendiri / admin" on public.slots
  for select to authenticated using (
    public.is_admin() or (public.is_verified() and exists (
      select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid()
    ))
  );

drop policy if exists "putaran: lihat" on public.rounds;
create policy "putaran: lihat" on public.rounds
  for select to authenticated using (public.is_verified());

drop policy if exists "bayar: lihat sendiri / admin" on public.payments;
create policy "bayar: lihat sendiri / admin" on public.payments
  for select to authenticated using (
    public.is_admin() or (public.is_verified() and exists (
      select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid()
    ))
  );

drop policy if exists "bayar: upload sendiri" on public.payments;
create policy "bayar: upload sendiri" on public.payments
  for insert to authenticated with check (
    status = 'menunggu' and public.is_verified() and exists (
      select 1 from public.memberships m
      where m.id = membership_id and m.user_id = auth.uid()
        and m.group_id = payments.group_id and m.status = 'aktif'
    )
  );

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

create or replace view public.public_profiles as
  select id, full_name from public.profiles where public.is_verified();

drop policy if exists "push: kelola sendiri" on public.push_subscriptions;
create policy "push: kelola sendiri" on public.push_subscriptions
  for all to authenticated
  using (public.is_admin() or (public.is_verified() and user_id = auth.uid()))
  with check (public.is_admin() or (public.is_verified() and user_id = auth.uid()));

drop policy if exists "bukti: upload ke folder sendiri" on storage.objects;
create policy "bukti: upload ke folder sendiri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bukti-transfer' and public.is_verified()
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "bukti: lihat sendiri / admin" on storage.objects;
create policy "bukti: lihat sendiri / admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'bukti-transfer'
         and (public.is_admin() or (public.is_verified()
              and (storage.foldername(name))[1] = auth.uid()::text)));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'profiles'
     ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

do $$
begin
  if to_regclass('public.roulette_sessions') is not null then
    execute 'drop policy if exists "rolet: peserta pantau sesi" on public.roulette_sessions';
    execute 'create policy "rolet: peserta pantau sesi" on public.roulette_sessions for select to authenticated using (public.is_verified())';
  end if;
  if to_regclass('public.roulette_draws') is not null then
    execute 'drop policy if exists "rolet: peserta lihat hasil" on public.roulette_draws';
    execute 'create policy "rolet: peserta lihat hasil" on public.roulette_draws for select to authenticated using (public.is_verified())';
  end if;
end $$;
