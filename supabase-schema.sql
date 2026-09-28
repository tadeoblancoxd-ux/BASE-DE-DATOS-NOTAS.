-- ============================================================
-- Planificador Semanal — Esquema de base de datos Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. TABLA PRINCIPAL: tasks
-- ------------------------------------------------------------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  day         smallint not null check (day between 0 and 6),
  time        text not null default '',
  cat         text not null default '',
  prio        text not null default 'media' check (prio in ('alta', 'media', 'baja')),
  recurring   boolean not null default false,
  week_key    text not null,
  done        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. ÍNDICES para mejorar el rendimiento
-- ------------------------------------------------------------
create index if not exists tasks_user_id_idx  on public.tasks(user_id);
create index if not exists tasks_week_key_idx on public.tasks(week_key);

-- 3. FUNCIÓN Y TRIGGER para actualizar updated_at automáticamente
-- ------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at
  before update on public.tasks
  for each row
  execute function public.handle_updated_at();

-- 4. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------
alter table public.tasks enable row level security;

-- 5. POLÍTICAS: cada usuario solo puede acceder a SUS tareas
-- ------------------------------------------------------------

-- Ver: solo las propias
create policy "Users can view own tasks"
  on public.tasks
  for select
  using (auth.uid() = user_id);

-- Crear: solo las propias
create policy "Users can insert own tasks"
  on public.tasks
  for insert
  with check (auth.uid() = user_id);

-- Editar: solo las propias
create policy "Users can update own tasks"
  on public.tasks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Eliminar: solo las propias
create policy "Users can delete own tasks"
  on public.tasks
  for delete
  using (auth.uid() = user_id);

-- 6. PERMISOS para el rol anon (necesario para que funcione)
-- ------------------------------------------------------------
grant usage on schema public to anon;
grant select, insert, update, delete on public.tasks to anon;
grant execute on function public.handle_updated_at() to anon;
