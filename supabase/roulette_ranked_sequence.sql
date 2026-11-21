-- Keep one payment/attendance period open while assigning winner positions.
-- Run after all existing roulette SQL setup files on the Supabase database.

alter table public.roulette_draws
  add column if not exists position_no integer;

with ranked_draws as (
  select
    d.id,
    coalesce(
      sum(jsonb_array_length(d.participants)) over (
        partition by d.group_id
        order by d.period_no, d.created_at, d.id
        rows between unbounded preceding and 1 preceding
      ),
      0
    )::integer + 1 as first_position
  from public.roulette_draws d
)
update public.roulette_draws d
set position_no = r.first_position
from ranked_draws r
where r.id = d.id
  and d.position_no is null;

alter table public.roulette_draws
  alter column position_no set not null;

alter table public.roulette_draws
  drop constraint if exists roulette_draws_session_id_key;

create unique index if not exists roulette_draws_group_position_idx
  on public.roulette_draws (group_id, position_no);

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
          (select max(d.period_no) from public.roulette_draws d where d.group_id = p_group),
          1
        )
        and a.user_id = m.user_id
    )
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  cross join lateral generate_series(1, m.slot_count) as slot(slot_no)
  where m.group_id = p_group
    and m.status = 'aktif'
    and exists (
      select 1
      from public.payments payment
      where payment.membership_id = m.id
        and payment.group_id = p_group
        and payment.period_no = coalesce(
          (select max(d.period_no) from public.roulette_draws d where d.group_id = p_group),
          1
        )
        and payment.status = 'disetujui'
    )
    and not exists (
      select 1
      from public.roulette_draw_winners winner
      where winner.group_id = p_group
        and winner.user_id = m.user_id
        and (winner.slot_no is null or winner.slot_no = slot.slot_no)
    )
    and not exists (
      select 1
      from public.roulette_draws d
      cross join lateral jsonb_array_elements(d.participants) as winner(value)
      where d.group_id = p_group
        and (winner.value->>'user_id')::uuid = m.user_id
        and (
          nullif(winner.value->>'slot_no', '') is null
          or nullif(winner.value->>'slot_no', '')::integer = slot.slot_no
        )
    );
$$;
revoke all on function public.roulette_remaining_slots(uuid) from public, anon, authenticated;

create or replace function public.register_roulette_attendance(p_group uuid, p_period integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  participant_name text;
  group_name text;
  inserted_count integer;
begin
  if auth.uid() is null or not public.is_verified() or not exists (
    select 1 from public.memberships m
    where m.group_id = p_group and m.user_id = auth.uid() and m.status = 'aktif'
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
    select 1 from public.roulette_remaining_slots(p_group) remaining
    where remaining.user_id = auth.uid()
  ) then
    raise exception 'Anda sudah mendapat giliran Kocokan';
  end if;
  if p_period is null or p_period <> coalesce(
    (select max(d.period_no) from public.roulette_draws d where d.group_id = p_group),
    1
  ) then
    raise exception 'Periode pendaftaran hadir tidak valid';
  end if;
  if not public.roulette_period_is_activated(p_group, p_period) then
    raise exception 'Pendaftaran hadir belum dibuka admin';
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
  if inserted_count = 0 then return false; end if;

  select p.full_name into participant_name from public.profiles p where p.id = auth.uid();
  select g.name into group_name from public.groups g where g.id = p_group;
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

create or replace function public.admin_register_roulette_attendance(
  p_group uuid,
  p_period integer,
  p_user uuid
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  participant_name text;
  group_name text;
  inserted_count integer;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menambahkan peserta ke daftar hadir';
  end if;
  if not exists (
    select 1 from public.groups g
    where g.id = p_group and g.type = 'uang' and g.draw_mode = 'acak'
  ) then
    raise exception 'Kelompok tidak tersedia untuk Rolet';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.group_id = p_group and m.user_id = p_user and m.status = 'aktif'
  ) then
    raise exception 'Peserta bukan anggota aktif kelompok ini';
  end if;
  if not exists (
    select 1 from public.roulette_remaining_slots(p_group) remaining
    where remaining.user_id = p_user
  ) then
    raise exception 'Peserta tidak memiliki slot Rolet yang tersisa';
  end if;
  if p_period is null or p_period <> coalesce(
    (select max(d.period_no) from public.roulette_draws d where d.group_id = p_group),
    1
  ) then
    raise exception 'Periode pendaftaran hadir tidak valid';
  end if;
  if not public.roulette_period_is_activated(p_group, p_period) then
    raise exception 'Pendaftaran hadir belum dibuka admin';
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
  values (p_group, p_period, p_user)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return false; end if;

  select p.full_name into participant_name from public.profiles p where p.id = p_user;
  select g.name into group_name from public.groups g where g.id = p_group;
  insert into public.roulette_chat_messages (group_id, user_id, body, is_system)
  values (
    p_group,
    auth.uid(),
    format('%s ditambahkan admin ke daftar hadir kelompok %s.', participant_name, group_name),
    true
  );
  return true;
end $$;
revoke all on function public.admin_register_roulette_attendance(uuid, integer, uuid) from public, anon;
grant execute on function public.admin_register_roulette_attendance(uuid, integer, uuid) to authenticated;

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
  if p_period <> coalesce(
    (select max(d.period_no) from public.roulette_draws d where d.group_id = p_group),
    1
  ) then
    raise exception 'Periode Rolet harus dijalankan secara berurutan';
  end if;
  if not public.roulette_period_is_activated(p_group, p_period) then
    raise exception 'Periode Rolet belum diaktifkan admin';
  end if;

  select array_agg(remaining.user_id order by remaining.user_id, remaining.slot_no)
  into active_ids
  from public.roulette_remaining_slots(p_group) remaining
  where remaining.is_registered;
  if coalesce(cardinality(active_ids), 0) < 1 then
    raise exception 'Minimal satu peserta aktif diperlukan untuk Rolet';
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
    where remaining.is_registered
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
revoke all on function public.start_roulette_session(uuid, integer) from public;
grant execute on function public.start_roulette_session(uuid, integer) to authenticated;

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
  if not public.roulette_period_is_activated(s.group_id, s.period_no) then
    raise exception 'Periode Rolet belum diaktifkan admin';
  end if;

  select array_agg(remaining.user_id order by remaining.user_id, remaining.slot_no)
  into active_ids
  from public.roulette_remaining_slots(s.group_id) remaining
  where remaining.is_registered;
  if coalesce(cardinality(active_ids), 0) < 1 then
    raise exception 'Tidak ada peserta aktif yang tersisa untuk Rolet';
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
    where remaining.is_registered
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
revoke all on function public.run_roulette_attempt(uuid) from public;
grant execute on function public.run_roulette_attempt(uuid) to authenticated;

create or replace function public.activate_roulette_period(p_group uuid, p_period integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  inserted_count integer;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat mengaktifkan periode Rolet';
  end if;
  if p_period is null or p_period < 1 or not exists (
    select 1 from public.groups g
    where g.id = p_group and g.type = 'uang' and g.draw_mode = 'acak'
  ) then
    raise exception 'Kelompok atau periode Rolet tidak valid';
  end if;
  if p_period <> coalesce(
    (select max(d.period_no) from public.roulette_draws d where d.group_id = p_group),
    1
  ) then
    raise exception 'Periode Rolet harus dijalankan secara berurutan';
  end if;
  insert into public.roulette_period_controls (group_id, period_no, activated_by)
  values (p_group, p_period, auth.uid())
  on conflict do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count > 0;
end $$;
revoke all on function public.activate_roulette_period(uuid, integer) from public, anon;
grant execute on function public.activate_roulette_period(uuid, integer) to authenticated;

create or replace function public.finish_roulette_attempt(p_session uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.roulette_sessions;
  total_rounds integer;
  current_position integer;
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
  select
    (select count(*) from public.roulette_remaining_slots(s.group_id))
    + coalesce((
      select sum(jsonb_array_length(d.participants))
      from public.roulette_draws d
      where d.group_id = s.group_id
    ), 0)
  into total_rounds;
  select coalesce(max(d.position_no + jsonb_array_length(d.participants) - 1), 0) + 1
  into current_position
  from public.roulette_draws d
  where d.group_id = s.group_id;
  elapsed_ms := extract(epoch from (now() - s.spin_started_at)) * 1000;
  if current_position <= 3 or coalesce(total_rounds, current_position) <= 3 then
    required_ms := 7000;
  else
    remaining_ratio := greatest(
      0,
      least(
        1,
        (coalesce(total_rounds, current_position) - current_position)::numeric
          / (coalesce(total_rounds, current_position) - 3)::numeric
      )
    );
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
revoke all on function public.finish_roulette_attempt(uuid) from public;
grant execute on function public.finish_roulette_attempt(uuid) to authenticated;

create or replace function public.save_roulette_attempt(p_session uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.roulette_sessions;
  selected_participant jsonb;
  draw_id uuid;
  next_position integer;
  remaining_count integer;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menyimpan hasil rolet';
  end if;
  select * into s from public.roulette_sessions where id = p_session for update;
  if not found or s.status <> 'active' then
    raise exception 'Sesi Rolet belum selesai berputar atau sudah ditutup';
  end if;
  if not public.roulette_period_is_activated(s.group_id, s.period_no) then
    raise exception 'Periode Rolet belum diaktifkan admin';
  end if;
  if s.attempt_count < 1 or jsonb_array_length(s.draft_order) < 1 then
    raise exception 'Belum ada hasil yang bisa disimpan';
  end if;

  selected_participant := s.draft_order->0;
  select coalesce(max(d.position_no + jsonb_array_length(d.participants) - 1), 0) + 1
  into next_position
  from public.roulette_draws d
  where d.group_id = s.group_id;

  insert into public.roulette_draws (
    group_id, period_no, session_id, attempt_no, position_no, participants, created_by
  )
  values (
    s.group_id,
    s.period_no,
    s.id,
    s.attempt_count,
    next_position,
    jsonb_build_array(selected_participant),
    auth.uid()
  )
  returning id into draw_id;

  select count(*) into remaining_count
  from public.roulette_remaining_slots(s.group_id);

  update public.roulette_sessions
  set status = case when remaining_count = 0 then 'saved' else 'active' end,
      selected_user_ids = '{}'::uuid[],
      draft_order = '[]'::jsonb,
      updated_at = now()
  where id = s.id;
  return draw_id;
end $$;
revoke all on function public.save_roulette_attempt(uuid) from public;
grant execute on function public.save_roulette_attempt(uuid) to authenticated;
