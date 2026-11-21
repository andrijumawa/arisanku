-- Run once on existing projects before deploying the matching app version.
-- Adds bounded admin queries, indexed search, faster capacity summaries,
-- and a normalized winner lookup for roulette history.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create index if not exists profiles_status_created_id_idx
  on public.profiles (account_status, created_at desc, id);
create index if not exists profiles_admin_priority_created_idx
  on public.profiles ((case when account_status = 'menunggu' then 0 else 1 end), created_at desc, id);
create index if not exists memberships_user_status_group_idx
  on public.memberships (user_id, status, group_id);
create index if not exists memberships_group_status_created_id_idx
  on public.memberships (group_id, status, created_at, id);
create index if not exists memberships_pending_created_id_idx
  on public.memberships (created_at, id)
  where status = 'menunggu';
create index if not exists payments_membership_created_period_idx
  on public.payments (membership_id, created_at desc, period_no);
create index if not exists payments_group_membership_period_idx
  on public.payments (group_id, membership_id, period_no, status);
create index if not exists payments_pending_created_id_idx
  on public.payments (created_at, id)
  where status = 'menunggu';
create index if not exists slots_membership_id_idx
  on public.slots (membership_id);
create index if not exists groups_created_id_idx
  on public.groups (created_at desc, id);
create index if not exists roulette_sessions_group_period_created_idx
  on public.roulette_sessions (group_id, period_no, created_at desc);

do $$
declare
  trgm_schema text;
begin
  select namespace.nspname into trgm_schema
  from pg_opclass opclass
  join pg_namespace namespace on namespace.oid = opclass.opcnamespace
  join pg_am access_method on access_method.oid = opclass.opcmethod
  where opclass.opcname = 'gin_trgm_ops' and access_method.amname = 'gin'
  limit 1;
  if trgm_schema is null then
    raise exception 'Operator class gin_trgm_ops tidak tersedia';
  end if;
  execute format(
    'create index if not exists profiles_full_name_trgm_idx on public.profiles using gin (full_name %I.gin_trgm_ops)',
    trgm_schema
  );
  execute format(
    'create index if not exists profiles_phone_trgm_idx on public.profiles using gin (phone %I.gin_trgm_ops)',
    trgm_schema
  );
end $$;

create or replace function public.admin_people_page(
  p_search text default '',
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  id uuid,
  full_name text,
  phone text,
  avatar_path text,
  role text,
  account_status text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat melihat daftar peserta';
  end if;

  return query
  with filtered_profiles as (
    select p.id, p.full_name, p.phone, p.avatar_path, p.role, p.account_status, p.created_at
    from public.profiles p
    where coalesce(p_search, '') = ''
      or p.full_name ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
      or p.phone ilike '%' || replace(replace(replace(p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
  )
  select
    p.id,
    p.full_name,
    p.phone,
    p.avatar_path,
    p.role,
    p.account_status,
    p.created_at,
    count(*) over ()
  from filtered_profiles p
  order by case when p.account_status = 'menunggu' then 0 else 1 end,
    p.created_at desc,
    p.id
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_people_page(text, integer, integer) from public, anon;
grant execute on function public.admin_people_page(text, integer, integer) to authenticated;

create or replace function public.group_availability_for_group(p_group uuid)
returns table (
  group_id uuid,
  reserved_slots bigint,
  active_participants bigint,
  active_slots bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with target_groups as (
    select g.id
    from public.groups g
    where (p_group is null or g.id = p_group)
      and public.is_verified()
  ),
  slot_totals as (
    select s.group_id, count(*)::bigint as total
    from public.slots s
    join target_groups g on g.id = s.group_id
    group by s.group_id
  ),
  pending_totals as (
    select m.group_id, sum(m.slot_count)::bigint as total
    from public.memberships m
    join target_groups g on g.id = m.group_id
    where m.status = 'menunggu'
    group by m.group_id
  ),
  active_totals as (
    select m.group_id,
      count(*)::bigint as participants,
      coalesce(sum(m.slot_count), 0)::bigint as slots
    from public.memberships m
    join target_groups g on g.id = m.group_id
    where m.status = 'aktif'
    group by m.group_id
  )
  select
    g.id,
    coalesce(st.total, 0) + coalesce(pt.total, 0),
    coalesce(at.participants, 0),
    coalesce(at.slots, 0)
  from target_groups g
  left join slot_totals st on st.group_id = g.id
  left join pending_totals pt on pt.group_id = g.id
  left join active_totals at on at.group_id = g.id;
$$;
revoke all on function public.group_availability_for_group(uuid) from public, anon;
grant execute on function public.group_availability_for_group(uuid) to authenticated;

create or replace function public.group_availability()
returns table (
  group_id uuid,
  reserved_slots bigint,
  active_participants bigint,
  active_slots bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select * from public.group_availability_for_group(null);
$$;
revoke all on function public.group_availability() from public, anon;
grant execute on function public.group_availability() to authenticated;

create table if not exists public.roulette_draw_winners (
  draw_id  uuid primary key references public.roulette_draws(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  slot_no  integer
);
insert into public.roulette_draw_winners (draw_id, group_id, user_id, slot_no)
select d.id,
  d.group_id,
  (winner.value->>'user_id')::uuid,
  nullif(winner.value->>'slot_no', '')::integer
from public.roulette_draws d
cross join lateral jsonb_array_elements(d.participants) with ordinality winner(value, ord)
where winner.ord = 1
  and winner.value ? 'user_id'
on conflict (draw_id) do nothing;
alter table public.roulette_draw_winners enable row level security;
revoke all on public.roulette_draw_winners from public, anon, authenticated;
create index if not exists roulette_draw_winners_group_user_slot_idx
  on public.roulette_draw_winners (group_id, user_id, slot_no);

create or replace function public.sync_roulette_draw_winner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.roulette_draw_winners (draw_id, group_id, user_id, slot_no)
  select new.id,
    new.group_id,
    (winner.value->>'user_id')::uuid,
    nullif(winner.value->>'slot_no', '')::integer
  from jsonb_array_elements(new.participants) with ordinality winner(value, ord)
  where winner.ord = 1 and winner.value ? 'user_id'
  on conflict (draw_id) do nothing;
  return new;
end $$;
drop trigger if exists sync_roulette_draw_winner on public.roulette_draws;
create trigger sync_roulette_draw_winner
  after insert on public.roulette_draws
  for each row execute function public.sync_roulette_draw_winner();
revoke all on function public.sync_roulette_draw_winner() from public, anon, authenticated;

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
      from public.roulette_draw_winners winner
      where winner.group_id = p_group
        and winner.user_id = m.user_id
        and (winner.slot_no is null or winner.slot_no = slot.slot_no)
    );
$$;
revoke all on function public.roulette_remaining_slots(uuid) from public, anon, authenticated;

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
  select coalesce(sum(m.slot_count), 0)::integer into total_rounds
  from public.memberships m
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
revoke all on function public.finish_roulette_attempt(uuid) from public;
grant execute on function public.finish_roulette_attempt(uuid) to authenticated;
