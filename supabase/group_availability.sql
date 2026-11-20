-- Peserta tidak dapat membaca membership dan slot milik peserta lain.
-- Fungsi ini hanya membagikan total slot terpakai dan permintaan yang menunggu.
drop function if exists public.group_availability();
create function public.group_availability()
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
  select
    g.id,
    coalesce((
      select count(*)::bigint
      from public.slots s
      where s.group_id = g.id
    ), 0) + coalesce((
      select sum(m.slot_count)::bigint
      from public.memberships m
      where m.group_id = g.id
        and m.status = 'menunggu'
    ), 0),
    (
      select count(*)::bigint
      from public.memberships m
      where m.group_id = g.id
        and m.status = 'aktif'
    ),
    coalesce((
      select sum(m.slot_count)::bigint
      from public.memberships m
      where m.group_id = g.id
        and m.status = 'aktif'
    ), 0)
  from public.groups g
  where public.is_verified();
$$;

revoke all on function public.group_availability() from public, anon;
grant execute on function public.group_availability() to authenticated;
