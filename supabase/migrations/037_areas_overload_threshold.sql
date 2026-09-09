-- Umbral de "carga alta" configurable por área (antes fijo en 5 tareas
-- abiertas). Lo define el gerente del área en /mi-area. Ver feedback de
-- Task 6 del dashboard de Proyectos (2026-09-09).
alter table public.areas
  add column overload_threshold integer not null default 5
  check (overload_threshold > 0);
