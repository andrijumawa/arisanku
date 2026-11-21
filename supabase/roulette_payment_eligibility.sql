-- Peserta hanya dapat hadir dan ikut pengocokan setelah pembayaran
-- untuk periode berikutnya disetujui admin.
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
    and exists (
      select 1
      from public.payments payment
      where payment.membership_id = m.id
        and payment.group_id = p_group
        and payment.period_no = coalesce(
          (select max(d.period_no) + 1 from public.roulette_draws d where d.group_id = p_group),
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
    );
$$;
revoke all on function public.roulette_remaining_slots(uuid) from public, anon, authenticated;
