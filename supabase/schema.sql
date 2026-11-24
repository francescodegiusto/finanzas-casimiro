-- Finanzas Casimiro: base de datos
-- Pegar entero en Supabase > SQL Editor > New query, y tocar "Run".
-- ANTES de tocar Run, cambiá los dos mails de la última parte, ahí mismo en el SQL Editor.
-- (Este archivo queda en GitHub con mails de ejemplo, así no se publican los reales).

-- 1. Quiénes pueden entrar ------------------------------------------------
create table if not exists public.miembros (
  email  text primary key,
  nombre text not null,
  libro  text not null check (libro in ('f', 'p'))   -- f = Franche, p = Patri
);
alter table public.miembros enable row level security;

drop policy if exists "cada una ve su fila" on public.miembros;
create policy "cada una ve su fila" on public.miembros
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

create or replace function public.es_miembro()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.miembros
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;
revoke all on function public.es_miembro() from public, anon;
grant execute on function public.es_miembro() to authenticated;

-- 2. Movimientos de las tres libretas ----------------------------------------
create table if not exists public.movimientos (
  id          text primary key,
  fecha       date not null,
  libro       text not null check (libro in ('n', 'f', 'p')),   -- n = Casimiro
  tipo        text not null check (tipo in ('venta','alquiler','fijo','variable','cheque',
                                            'sueldo','gasto','ahorro','puse','devolvio')),
  monto       numeric(14, 2),
  detalle     text not null default '',
  pago        text not null default '',
  rubro       text not null default '',
  origen      text not null default '',
  nota        text not null default '',
  creado_por  uuid default auth.uid(),
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists movimientos_fecha_idx on public.movimientos (fecha);

alter table public.movimientos enable row level security;

drop policy if exists "miembros leen"     on public.movimientos;
drop policy if exists "miembros agregan"  on public.movimientos;
drop policy if exists "miembros cambian"  on public.movimientos;
drop policy if exists "miembros borran"   on public.movimientos;
create policy "miembros leen"    on public.movimientos for select to authenticated using (public.es_miembro());
create policy "miembros agregan" on public.movimientos for insert to authenticated with check (public.es_miembro());
create policy "miembros cambian" on public.movimientos for update to authenticated using (public.es_miembro()) with check (public.es_miembro());
create policy "miembros borran"  on public.movimientos for delete to authenticated using (public.es_miembro());

create or replace function public.marcar_actualizado()
returns trigger language plpgsql as $$
begin
  new.actualizado := now();
  return new;
end;
$$;
drop trigger if exists movimientos_actualizado on public.movimientos;
create trigger movimientos_actualizado
  before update on public.movimientos
  for each row execute function public.marcar_actualizado();

-- Para que los cambios de una aparezcan solos en el celular de la otra
do $$
begin
  alter publication supabase_realtime add table public.movimientos;
exception when others then null;
end $$;

-- Permisos de acceso para usuarios con sesión iniciada (las políticas de arriba filtran quién ve qué)
grant usage on schema public to authenticated;
grant select on public.miembros to authenticated;
grant select, insert, update, delete on public.movimientos to authenticated;
revoke all on public.miembros, public.movimientos from anon;

-- 3. Las dos personas habilitadas --------------------------------------------
insert into public.miembros (email, nombre, libro) values
  ('MAIL-DE-FRANCHE@gmail.com',   'Franche', 'f'),
  ('MAIL-DE-PATRI@gmail.com',     'Patri',   'p')
on conflict (email) do update set nombre = excluded.nombre, libro = excluded.libro;
