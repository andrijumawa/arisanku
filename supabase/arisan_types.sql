create table if not exists public.arisan_types (
  code text primary key,
  label text not null,
  category text not null check (category in ('uang','paket')),
  created_at timestamptz not null default now()
);

insert into public.arisan_types (code, label, category)
values
  ('uang', 'Arisan Uang', 'uang'),
  ('paket', 'Arisan Paket Lebaran', 'paket')
on conflict (code) do nothing;

alter table public.arisan_types enable row level security;

drop policy if exists "jenis arisan: lihat" on public.arisan_types;
create policy "jenis arisan: lihat" on public.arisan_types
  for select to authenticated using (public.is_verified());

drop policy if exists "jenis arisan: admin kelola" on public.arisan_types;
create policy "jenis arisan: admin kelola" on public.arisan_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.arisan_types to authenticated;
grant insert, update, delete on public.arisan_types to authenticated;
