-- Setiap slot keanggotaan menjadi satu entri peluang di rolet.
-- Jalankan migration ini pada database aktif setelah deploy kode aplikasi terbaru.

create or replace function public.roulette_remaining_slots(p_group uuid)
returns table (
  user_id uuid,
  full_name text,
  slot_no integer,
  slot_count integer,
  is_registered boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    p.full_name,
    slot.slot_no,
    m.slot_count,
    exists (
      select 1
      from public.roulette_attendance a
      where a.group_id = p_group
        and a.period_no = coalesce(
          (select max(d.period_no) + 1 from public.roulette_draws d where d.group_id = p_group),
          1
        )
        and a.user_id = m.user_id
    )
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  cross join lateral generate_series(1, m.slot_count) as slot(slot_no)
  where m.group_id = p_group
    and m.status = 'aktif'
    and not exists (
      select 1
      from public.roulette_draws d
      cross join lateral jsonb_array_elements(d.participants) with ordinality winner(value, ord)
      where d.group_id = p_group
        and winner.ord = 1
        and winner.value->>'user_id' = m.user_id::text
        and (
          winner.value->>'slot_no' is null
          or (winner.value->>'slot_no')::integer = slot.slot_no
        )
    );
$$;
revoke all on function public.roulette_remaining_slots(uuid) from public, anon, authenticated;

create or replace function public.get_roulette_participants(p_group uuid)
returns table (
  user_id uuid,
  full_name text,
  slot_no integer,
  slot_count integer,
  is_registered boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_verified() or not (
    public.is_admin()
    or exists (
      select 1
      from public.memberships m
      where m.group_id = p_group
        and m.user_id = auth.uid()
        and m.status = 'aktif'
    )
  ) then
    raise exception 'Hanya admin atau peserta aktif terverifikasi yang dapat melihat peserta Rolet';
  end if;

  if not exists (
    select 1
    from public.groups g
    where g.id = p_group
      and g.type = 'uang'
      and g.draw_mode = 'acak'
  ) then
    raise exception 'Kelompok tidak tersedia untuk Rolet';
  end if;

  return query
  select remaining.user_id, remaining.full_name, remaining.slot_no,
    remaining.slot_count, remaining.is_registered
  from public.roulette_remaining_slots(p_group) remaining;
end;
$$;
revoke all on function public.get_roulette_participants(uuid) from public, anon;
grant execute on function public.get_roulette_participants(uuid) to authenticated;

drop function if exists public.start_roulette_session(uuid);
drop function if exists public.run_roulette_attempt(uuid, uuid[]);

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
  if not exists (
    select 1
    from public.roulette_remaining_slots(p_group) remaining
    where remaining.user_id = auth.uid()
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
  if p_period is null or p_period < 1 or not exists (
    select 1 from public.groups
    where id = p_group and type = 'uang' and draw_mode = 'acak'
  ) then
    raise exception 'Kelompok atau periode Rolet tidak valid';
  end if;

  if p_period <> (
    select coalesce(max(period_no), 0) + 1
    from public.roulette_draws
    where group_id = p_group
  ) then
    raise exception 'Putaran Rolet harus dijalankan secara berurutan';
  end if;

  select array_agg(remaining.user_id order by remaining.user_id, remaining.slot_no)
  into active_ids
  from public.roulette_remaining_slots(p_group) remaining;
  if coalesce(cardinality(active_ids), 0) < 2 then
    raise exception 'Minimal dua peserta aktif diperlukan untuk Rolet';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'user_id', user_id,
      'full_name', full_name,
      'slot_no', slot_no,
      'slot_count', slot_count
    )
    order by is_registered desc, order_key
  )
  into shuffled_participants
  from (
    select remaining.*, gen_random_uuid() as order_key
    from public.roulette_remaining_slots(p_group) remaining
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

  select array_agg(remaining.user_id order by remaining.user_id, remaining.slot_no)
  into active_ids
  from public.roulette_remaining_slots(s.group_id) remaining;
  if coalesce(cardinality(active_ids), 0) < 2 then
    raise exception 'Minimal dua peserta aktif diperlukan untuk Rolet';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'user_id', user_id,
      'full_name', full_name,
      'slot_no', slot_no,
      'slot_count', slot_count
    )
    order by is_registered desc, order_key
  )
  into shuffled_participants
  from (
    select remaining.*, gen_random_uuid() as order_key
    from public.roulette_remaining_slots(s.group_id) remaining
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
  from public.memberships m
  cross join lateral generate_series(1, m.slot_count) as slot(slot_no)
  where m.group_id = s.group_id and m.status = 'aktif';
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

revoke all on function public.start_roulette_session(uuid, integer) from public;
revoke all on function public.run_roulette_attempt(uuid) from public;
revoke all on function public.finish_roulette_attempt(uuid) from public;
grant execute on function public.start_roulette_session(uuid, integer) to authenticated;
grant execute on function public.run_roulette_attempt(uuid) to authenticated;
grant execute on function public.finish_roulette_attempt(uuid) to authenticated;
