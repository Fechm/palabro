-- Palabras nuevas por día elegidas por cada persona (registro y pantalla Progreso).
alter table public.user_stats
  add column new_per_day smallint not null default 20
  check (new_per_day in (5, 10, 20, 30));
