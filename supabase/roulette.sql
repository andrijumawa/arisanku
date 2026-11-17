-- Rolet: admin menyusun urutan peserta secara acak; peserta melihat hasil tersimpan.
create table if not exists public.roulette_sessions (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups(id) on delete cascade,
  created_by         uuid not null references public.profiles(id),
  attempt_count      smallint not null default 0 check (attempt_count between 0 and 3),
  selected_user_ids  uuid[] not null default '{}',
  draft_order        jsonb not null default '[]'::jsonb,
  status             text not null default 'active' check (status in ('active','saved')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists roulette_one_active_session_per_group
  on public.roulette_sessions (group_id) where status = 'active';

create table if not exists public.roulette_draws (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  session_id  uuid not null unique references public.roulette_sessions(id) on delete cascade,
  attempt_no  smallint not null check (attempt_no between 1 and 3),
  participants jsonb not null check (jsonb_typeof(participants) = 'array'),
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index if not exists roulette_draws_group_created_idx
  on public.roulette_draws (group_id, created_at desc);

alter table public.roulette_sessions enable row level security;
alter table public.roulette_draws enable row level security;

drop policy if exists "rolet: admin lihat sesi" on public.roulette_sessions;
create policy "rolet: admin lihat sesi" on public.roulette_sessions
  for select to authenticated using (public.is_admin());

drop policy if exists "rolet: peserta lihat hasil" on public.roulette_draws;
create policy "rolet: peserta lihat hasil" on public.roulette_draws
  for select to authenticated using (true);

grant select on public.roulette_sessions, public.roulette_draws to authenticated;

create or replace function public.start_roulette_session(p_group uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menjalankan rolet';
  end if;
  if not exists (
    select 1 from public.groups where id = p_group and type = 'uang' and draw_mode = 'acak'
  ) then
    raise exception 'Rolet hanya tersedia untuk kelompok arisan uang dengan undian acak';
  end if;

  insert into public.roulette_sessions (group_id, created_by)
  values (p_group, auth.uid())
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.run_roulette_attempt(p_session uuid, p_user_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.roulette_sessions;
  selected_count int;
  active_count int;
  next_attempt smallint;
  shuffled_participants jsonb;
  saved_draw uuid;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menjalankan rolet';
  end if;

  select * into s from public.roulette_sessions where id = p_session for update;
  if not found or s.status <> 'active' then
    raise exception 'Sesi rolet tidak aktif';
  end if;
  if s.attempt_count >= 3 then
    raise exception 'Batas tiga kali pengacakan sudah tercapai';
  end if;
  if p_user_ids is null or array_position(p_user_ids, null) is not null then
    raise exception 'Pilih minimal dua peserta';
  end if;
  select count(distinct user_id), count(*) into selected_count, active_count
  from unnest(p_user_ids) as chosen(user_id);
  if selected_count < 2 or selected_count <> active_count then
    raise exception 'Pilih minimal dua peserta tanpa duplikasi';
  end if;

  select count(*) into active_count
  from public.memberships m
  where m.group_id = s.group_id
    and m.status = 'aktif'
    and m.user_id = any(p_user_ids);
  if active_count <> selected_count then
    raise exception 'Daftar peserta berubah. Muat ulang kelompok lalu pilih kembali';
  end if;

  with shuffled as (
    select p.id, p.full_name, gen_random_uuid() as order_key
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.group_id = s.group_id
      and m.status = 'aktif'
      and m.user_id = any(p_user_ids)
  )
  select
    jsonb_agg(jsonb_build_object('user_id', id, 'full_name', full_name) order by order_key)
  into shuffled_participants
  from shuffled;

  next_attempt := s.attempt_count + 1;
  update public.roulette_sessions
  set attempt_count = next_attempt,
      selected_user_ids = p_user_ids,
      draft_order = shuffled_participants,
      updated_at = now()
  where id = s.id;

  if next_attempt = 3 then
    insert into public.roulette_draws (group_id, session_id, attempt_no, participants, created_by)
    values (s.group_id, s.id, next_attempt, shuffled_participants, auth.uid())
    returning id into saved_draw;
    update public.roulette_sessions set status = 'saved', updated_at = now() where id = s.id;
  end if;

  return jsonb_build_object(
    'session_id', s.id,
    'attempt_no', next_attempt,
    'participants', shuffled_participants,
    'saved_draw_id', saved_draw
  );
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
    raise exception 'Sesi rolet tidak aktif';
  end if;
  if s.attempt_count not between 1 and 2 or jsonb_array_length(s.draft_order) < 2 then
    raise exception 'Belum ada hasil yang bisa disimpan';
  end if;

  insert into public.roulette_draws (group_id, session_id, attempt_no, participants, created_by)
  values (s.group_id, s.id, s.attempt_count, s.draft_order, auth.uid())
  returning id into draw_id;
  update public.roulette_sessions set status = 'saved', updated_at = now() where id = s.id;
  return draw_id;
end $$;

revoke all on function public.start_roulette_session(uuid) from public;
revoke all on function public.run_roulette_attempt(uuid, uuid[]) from public;
revoke all on function public.save_roulette_attempt(uuid) from public;
grant execute on function public.start_roulette_session(uuid) to authenticated;
grant execute on function public.run_roulette_attempt(uuid, uuid[]) to authenticated;
grant execute on function public.save_roulette_attempt(uuid) to authenticated;
