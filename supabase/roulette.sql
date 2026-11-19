-- Rolet bersama: peserta memantau sesi, hanya admin yang memulai, mengulang, dan menyimpan.
create table if not exists public.roulette_sessions (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups(id) on delete cascade,
  period_no          int not null default 1 check (period_no >= 1),
  created_by         uuid not null references public.profiles(id),
  attempt_count      integer not null default 0 check (attempt_count >= 0),
  selected_user_ids  uuid[] not null default '{}',
  draft_order        jsonb not null default '[]'::jsonb,
  status             text not null default 'active',
  spin_started_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.roulette_sessions add column if not exists period_no int not null default 1;
alter table public.roulette_sessions add column if not exists spin_started_at timestamptz;
alter table public.roulette_sessions drop constraint if exists roulette_sessions_attempt_count_check;
alter table public.roulette_sessions alter column attempt_count type integer using attempt_count::integer;
alter table public.roulette_sessions add constraint roulette_sessions_attempt_count_check
  check (attempt_count >= 0);
alter table public.roulette_sessions alter column status set default 'active';
alter table public.roulette_sessions drop constraint if exists roulette_sessions_status_check;
alter table public.roulette_sessions add constraint roulette_sessions_status_check
  check (status in ('active','spinning','saved','cancelled'));

drop index if exists public.roulette_one_active_session_per_group;
create unique index if not exists roulette_one_active_session_per_period
  on public.roulette_sessions (group_id, period_no)
  where status in ('active','spinning');

create table if not exists public.roulette_draws (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  period_no    int not null default 1 check (period_no >= 1),
  session_id   uuid not null unique references public.roulette_sessions(id) on delete cascade,
  attempt_no   integer not null check (attempt_no >= 1),
  participants jsonb not null check (jsonb_typeof(participants) = 'array'),
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

create table if not exists public.roulette_chat_messages (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  is_system  boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.roulette_chat_messages
  add column if not exists is_system boolean not null default false;

create index if not exists roulette_chat_messages_group_created_idx
  on public.roulette_chat_messages (group_id, created_at desc);

create table if not exists public.roulette_attendance (
  group_id  uuid not null references public.groups(id) on delete cascade,
  period_no integer not null check (period_no >= 1),
  user_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, period_no, user_id)
);

alter table public.roulette_draws add column if not exists period_no int not null default 1;
alter table public.roulette_draws drop constraint if exists roulette_draws_attempt_no_check;
alter table public.roulette_draws alter column attempt_no type integer using attempt_no::integer;
alter table public.roulette_draws add constraint roulette_draws_attempt_no_check
  check (attempt_no >= 1);
drop index if exists public.roulette_draws_group_created_idx;
create index if not exists roulette_draws_group_period_created_idx
  on public.roulette_draws (group_id, period_no, created_at desc);

alter table public.roulette_sessions enable row level security;
alter table public.roulette_draws enable row level security;
alter table public.roulette_chat_messages enable row level security;
alter table public.roulette_attendance enable row level security;

create or replace function public.can_access_roulette_chat(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    public.is_verified() and exists (
      select 1
      from public.memberships m
      where m.group_id = p_group
        and m.user_id = auth.uid()
        and m.status = 'aktif'
    )
  );
$$;
revoke all on function public.can_access_roulette_chat(uuid) from public;
grant execute on function public.can_access_roulette_chat(uuid) to authenticated;

create or replace function public.roulette_chat_admin_ids(p_group uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id order by p.id), '{}'::uuid[])
  from public.profiles p
  where p.role = 'admin'
    and public.can_access_roulette_chat(p_group);
$$;
revoke all on function public.roulette_chat_admin_ids(uuid) from public;
grant execute on function public.roulette_chat_admin_ids(uuid) to authenticated;

create or replace function public.chat_admin_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id order by id), '{}'::uuid[])
  from public.profiles
  where role = 'admin' and public.can_chat();
$$;
revoke all on function public.chat_admin_ids() from public;
grant execute on function public.chat_admin_ids() to authenticated;

drop policy if exists "rolet chat: anggota kelompok baca" on public.roulette_chat_messages;
create policy "rolet chat: anggota kelompok baca" on public.roulette_chat_messages
  for select to authenticated using (public.can_access_roulette_chat(group_id));

drop policy if exists "rolet chat: anggota kelompok kirim" on public.roulette_chat_messages;
create policy "rolet chat: anggota kelompok kirim" on public.roulette_chat_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not is_system
    and public.can_access_roulette_chat(group_id)
  );

drop policy if exists "rolet hadir: anggota kelompok lihat" on public.roulette_attendance;
create policy "rolet hadir: anggota kelompok lihat" on public.roulette_attendance
  for select to authenticated using (public.can_access_roulette_chat(group_id));

grant select, insert on public.roulette_chat_messages to authenticated;
grant usage, select on sequence public.roulette_chat_messages_id_seq to authenticated;
grant select on public.roulette_attendance to authenticated;

create or replace function public.register_roulette_attendance(p_group uuid, p_period integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  participant_name text;
  group_name text;
  inserted_count integer;
begin
  if auth.uid() is null or not public.is_verified() or not exists (
    select 1
    from public.memberships m
    where m.group_id = p_group
      and m.user_id = auth.uid()
      and m.status = 'aktif'
  ) then
    raise exception 'Hanya peserta aktif kelompok yang dapat mendaftar hadir';
  end if;
  if not exists (
    select 1 from public.groups g
    where g.id = p_group and g.type = 'uang' and g.draw_mode = 'acak'
  ) then
    raise exception 'Kelompok tidak tersedia untuk Kocokan';
  end if;
  if exists (
    select 1
    from public.roulette_draws d
    cross join lateral jsonb_array_elements(d.participants) with ordinality winner(value, ord)
    where d.group_id = p_group
      and winner.ord = 1
      and winner.value->>'user_id' = auth.uid()::text
  ) then
    raise exception 'Anda sudah mendapat giliran Kocokan';
  end if;

  if p_period is null or p_period <> (
    select coalesce(max(d.period_no), 0) + 1
    from public.roulette_draws d
    where d.group_id = p_group
  ) then
    raise exception 'Periode pendaftaran hadir tidak valid';
  end if;

  if exists (
    select 1 from public.roulette_sessions s
    where s.group_id = p_group
      and s.period_no = p_period
      and s.status in ('active', 'spinning', 'saved')
  ) then
    raise exception 'Pendaftaran hadir ditutup karena kocokan sudah dimulai';
  end if;

  insert into public.roulette_attendance (group_id, period_no, user_id)
  values (p_group, p_period, auth.uid())
  on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return false;
  end if;

  select p.full_name into participant_name
  from public.profiles p where p.id = auth.uid();
  select g.name into group_name
  from public.groups g where g.id = p_group;

  insert into public.roulette_chat_messages (group_id, user_id, body, is_system)
  values (
    p_group,
    auth.uid(),
    format('%s telah bergabung di kelompok %s.', participant_name, group_name),
    true
  );
  return true;
end $$;
revoke all on function public.register_roulette_attendance(uuid, integer) from public;
grant execute on function public.register_roulette_attendance(uuid, integer) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'roulette_chat_messages'
    ) then
    alter publication supabase_realtime add table public.roulette_chat_messages;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'roulette_attendance'
    ) then
    alter publication supabase_realtime add table public.roulette_attendance;
  end if;
end $$;

drop policy if exists "rolet: admin lihat sesi" on public.roulette_sessions;
drop policy if exists "rolet: peserta pantau sesi" on public.roulette_sessions;
create policy "rolet: peserta pantau sesi" on public.roulette_sessions
  for select to authenticated using (public.is_verified());

drop policy if exists "rolet: peserta lihat hasil" on public.roulette_draws;
create policy "rolet: peserta lihat hasil" on public.roulette_draws
  for select to authenticated using (public.is_verified());

grant select on public.roulette_sessions, public.roulette_draws to authenticated;

drop function if exists public.start_roulette_session(uuid);
drop function if exists public.run_roulette_attempt(uuid, uuid[]);

create or replace function public.start_roulette_session(p_group uuid, p_period integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  shuffled_participants jsonb;
  active_ids uuid[];
  winner_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menjalankan rolet';
  end if;
  if p_period is null or p_period < 1 or not exists (
    select 1 from public.groups
    where id = p_group and type = 'uang' and draw_mode = 'acak'
  ) then
    raise exception 'Kelompok atau periode Rolet tidak valid';
  end if;

  select coalesce(array_agg(DISTINCT (winner.value->>'user_id')::uuid), '{}'::uuid[]) into winner_ids
  from public.roulette_draws d
  cross join lateral jsonb_array_elements(d.participants) with ordinality winner(value, ord)
  where d.group_id = p_group and winner.ord = 1;

  if p_period <> (
    select coalesce(max(period_no), 0) + 1
    from public.roulette_draws
    where group_id = p_group
  ) then
    raise exception 'Putaran Rolet harus dijalankan secara berurutan';
  end if;

  select array_agg(m.user_id order by m.user_id) into active_ids
  from public.memberships m
  where m.group_id = p_group
    and m.status = 'aktif'
    and not (m.user_id = any(coalesce(winner_ids, '{}'::uuid[])));
  if coalesce(cardinality(active_ids), 0) < 2 then
    raise exception 'Minimal dua peserta aktif diperlukan untuk Rolet';
  end if;

  select jsonb_agg(jsonb_build_object('user_id', id, 'full_name', full_name) order by is_registered desc, order_key)
  into shuffled_participants
  from (
    select p.id, p.full_name,
      exists (
        select 1
        from public.roulette_attendance a
        where a.group_id = p_group
          and a.period_no = p_period
          and a.user_id = p.id
      ) as is_registered,
      gen_random_uuid() as order_key
    from public.profiles p
    where p.id = any(active_ids)
  ) participants;

  insert into public.roulette_sessions (
    group_id, period_no, created_by, attempt_count, selected_user_ids,
    draft_order, status, spin_started_at
  )
  values (
    p_group, p_period, auth.uid(), 1, active_ids,
    shuffled_participants, 'spinning', now()
  )
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.run_roulette_attempt(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.roulette_sessions;
  active_ids uuid[];
  winner_ids uuid[];
  shuffled_participants jsonb;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menjalankan rolet';
  end if;

  select * into s from public.roulette_sessions where id = p_session for update;
  if not found or s.status <> 'active' then
    raise exception 'Sesi Rolet belum selesai berputar atau sudah ditutup';
  end if;
  select coalesce(array_agg(DISTINCT (winner.value->>'user_id')::uuid), '{}'::uuid[]) into winner_ids
  from public.roulette_draws d
  cross join lateral jsonb_array_elements(d.participants) with ordinality winner(value, ord)
  where d.group_id = s.group_id and winner.ord = 1;

  select array_agg(m.user_id order by m.user_id) into active_ids
  from public.memberships m
  where m.group_id = s.group_id
    and m.status = 'aktif'
    and not (m.user_id = any(coalesce(winner_ids, '{}'::uuid[])));
  if coalesce(cardinality(active_ids), 0) < 2 then
    raise exception 'Minimal dua peserta aktif diperlukan untuk Rolet';
  end if;

  select jsonb_agg(jsonb_build_object('user_id', id, 'full_name', full_name) order by is_registered desc, order_key)
  into shuffled_participants
  from (
    select p.id, p.full_name,
      exists (
        select 1
        from public.roulette_attendance a
        where a.group_id = s.group_id
          and a.period_no = s.period_no
          and a.user_id = p.id
      ) as is_registered,
      gen_random_uuid() as order_key
    from public.profiles p
    where p.id = any(active_ids)
  ) participants;

  update public.roulette_sessions
  set attempt_count = attempt_count + 1,
      selected_user_ids = active_ids,
      draft_order = shuffled_participants,
      status = 'spinning',
      spin_started_at = now(),
      updated_at = now()
  where id = s.id;

  return jsonb_build_object('attempt_no', s.attempt_count + 1);
end $$;

create or replace function public.finish_roulette_attempt(p_session uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.roulette_sessions;
  draw_id uuid;
  total_rounds integer;
  elapsed_ms numeric;
  required_ms numeric;
  remaining_ratio numeric;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menyelesaikan putaran Rolet';
  end if;

  select * into s from public.roulette_sessions where id = p_session for update;
  if not found or s.status <> 'spinning' then
    return null;
  end if;
  select count(*)::integer into total_rounds
  from public.memberships
  where group_id = s.group_id and status = 'aktif';
  elapsed_ms := extract(epoch from (now() - s.spin_started_at)) * 1000;
  if s.period_no <= 3 or coalesce(total_rounds, s.period_no) <= 3 then
    required_ms := 7000;
  else
    remaining_ratio := greatest(0, least(1, (coalesce(total_rounds, s.period_no) - s.period_no)::numeric / (coalesce(total_rounds, s.period_no) - 3)::numeric));
    required_ms := 3000 + 4000 * remaining_ratio;
  end if;
  if elapsed_ms < required_ms then
    raise exception 'Animasi Rolet masih berlangsung';
  end if;

  update public.roulette_sessions
  set status = 'active', updated_at = now()
  where id = s.id;

  return null;
end $$;

create or replace function public.save_roulette_attempt(p_session uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.roulette_sessions;
  draw_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menyimpan hasil rolet';
  end if;

  select * into s from public.roulette_sessions where id = p_session for update;
  if not found or s.status <> 'active' then
    raise exception 'Sesi Rolet belum selesai berputar atau sudah ditutup';
  end if;
  if s.attempt_count < 1 or jsonb_array_length(s.draft_order) < 2 then
    raise exception 'Belum ada hasil yang bisa disimpan';
  end if;

  insert into public.roulette_draws (
    group_id, period_no, session_id, attempt_no, participants, created_by
  )
  values (
    s.group_id,
    s.period_no,
    s.id,
    s.attempt_count,
    case
      when jsonb_array_length(s.draft_order) = 2 then s.draft_order
      else jsonb_build_array(s.draft_order->0)
    end,
    auth.uid()
  )
  returning id into draw_id;
  update public.roulette_sessions
  set status = 'saved', updated_at = now()
  where id = s.id;
  return draw_id;
end $$;

create or replace function public.cancel_roulette_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.roulette_sessions;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat membatalkan Rolet';
  end if;

  select * into s
  from public.roulette_sessions
  where id = p_session
  for update;

  if not found or s.status not in ('active','spinning') then
    raise exception 'Hasil Rolet tidak dapat dibatalkan';
  end if;

  update public.roulette_sessions
  set status = 'cancelled', updated_at = now()
  where id = s.id;
end $$;

revoke all on function public.start_roulette_session(uuid, integer) from public;
revoke all on function public.run_roulette_attempt(uuid) from public;
revoke all on function public.finish_roulette_attempt(uuid) from public;
revoke all on function public.save_roulette_attempt(uuid) from public;
revoke all on function public.cancel_roulette_session(uuid) from public;
grant execute on function public.start_roulette_session(uuid, integer) to authenticated;
grant execute on function public.run_roulette_attempt(uuid) to authenticated;
grant execute on function public.finish_roulette_attempt(uuid) to authenticated;
grant execute on function public.save_roulette_attempt(uuid) to authenticated;
grant execute on function public.cancel_roulette_session(uuid) to authenticated;
