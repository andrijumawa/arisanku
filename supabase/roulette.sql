-- Rolet bersama: peserta memantau sesi, hanya admin yang memulai, mengulang, dan menyimpan.
create table if not exists public.roulette_sessions (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups(id) on delete cascade,
  period_no          int not null default 1 check (period_no >= 1),
  created_by         uuid not null references public.profiles(id),
  attempt_count      smallint not null default 0 check (attempt_count between 0 and 3),
  selected_user_ids  uuid[] not null default '{}',
  draft_order        jsonb not null default '[]'::jsonb,
  status             text not null default 'active',
  spin_started_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.roulette_sessions add column if not exists period_no int not null default 1;
alter table public.roulette_sessions add column if not exists spin_started_at timestamptz;
alter table public.roulette_sessions alter column status set default 'active';
alter table public.roulette_sessions drop constraint if exists roulette_sessions_status_check;
alter table public.roulette_sessions add constraint roulette_sessions_status_check
  check (status in ('active','spinning','saved'));

drop index if exists public.roulette_one_active_session_per_group;
create unique index if not exists roulette_one_active_session_per_period
  on public.roulette_sessions (group_id, period_no)
  where status in ('active','spinning');

create table if not exists public.roulette_draws (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  period_no    int not null default 1 check (period_no >= 1),
  session_id   uuid not null unique references public.roulette_sessions(id) on delete cascade,
  attempt_no   smallint not null check (attempt_no between 1 and 3),
  participants jsonb not null check (jsonb_typeof(participants) = 'array'),
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

alter table public.roulette_draws add column if not exists period_no int not null default 1;
drop index if exists public.roulette_draws_group_created_idx;
create index if not exists roulette_draws_group_period_created_idx
  on public.roulette_draws (group_id, period_no, created_at desc);

alter table public.roulette_sessions enable row level security;
alter table public.roulette_draws enable row level security;

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
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menjalankan rolet';
  end if;
  if p_period < 1 or not exists (
    select 1 from public.groups
    where id = p_group and type = 'uang' and draw_mode = 'acak' and p_period <= durasi
  ) then
    raise exception 'Kelompok atau periode Rolet tidak valid';
  end if;

  select array_agg(m.user_id order by m.user_id) into active_ids
  from public.memberships m
  where m.group_id = p_group and m.status = 'aktif';
  if coalesce(cardinality(active_ids), 0) < 2 then
    raise exception 'Minimal dua peserta aktif diperlukan untuk Rolet';
  end if;

  select jsonb_agg(jsonb_build_object('user_id', id, 'full_name', full_name) order by order_key)
  into shuffled_participants
  from (
    select p.id, p.full_name, gen_random_uuid() as order_key
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
  shuffled_participants jsonb;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menjalankan rolet';
  end if;

  select * into s from public.roulette_sessions where id = p_session for update;
  if not found or s.status <> 'active' then
    raise exception 'Sesi Rolet belum selesai berputar atau sudah ditutup';
  end if;
  if s.attempt_count >= 3 then
    raise exception 'Batas tiga kali pengacakan sudah tercapai';
  end if;

  select array_agg(m.user_id order by m.user_id) into active_ids
  from public.memberships m
  where m.group_id = s.group_id and m.status = 'aktif';
  if coalesce(cardinality(active_ids), 0) < 2 then
    raise exception 'Minimal dua peserta aktif diperlukan untuk Rolet';
  end if;

  select jsonb_agg(jsonb_build_object('user_id', id, 'full_name', full_name) order by order_key)
  into shuffled_participants
  from (
    select p.id, p.full_name, gen_random_uuid() as order_key
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
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menyelesaikan putaran Rolet';
  end if;

  select * into s from public.roulette_sessions where id = p_session for update;
  if not found or s.status <> 'spinning' then
    return null;
  end if;
  if s.spin_started_at > now() - interval '5 seconds' then
    raise exception 'Animasi Rolet masih berlangsung';
  end if;

  if s.attempt_count = 3 then
    insert into public.roulette_draws (
      group_id, period_no, session_id, attempt_no, participants, created_by
    )
    values (s.group_id, s.period_no, s.id, s.attempt_count, s.draft_order, auth.uid())
    returning id into draw_id;
    update public.roulette_sessions
    set status = 'saved', updated_at = now()
    where id = s.id;
  else
    update public.roulette_sessions
    set status = 'active', updated_at = now()
    where id = s.id;
  end if;

  return draw_id;
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
  values (s.group_id, s.period_no, s.id, s.attempt_count, s.draft_order, auth.uid())
  returning id into draw_id;
  update public.roulette_sessions
  set status = 'saved', updated_at = now()
  where id = s.id;
  return draw_id;
end $$;

revoke all on function public.start_roulette_session(uuid, integer) from public;
revoke all on function public.run_roulette_attempt(uuid) from public;
revoke all on function public.finish_roulette_attempt(uuid) from public;
revoke all on function public.save_roulette_attempt(uuid) from public;
grant execute on function public.start_roulette_session(uuid, integer) to authenticated;
grant execute on function public.run_roulette_attempt(uuid) to authenticated;
grant execute on function public.finish_roulette_attempt(uuid) to authenticated;
grant execute on function public.save_roulette_attempt(uuid) to authenticated;
