-- Aggregates slot and membership totals once, with an optional group filter.
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
