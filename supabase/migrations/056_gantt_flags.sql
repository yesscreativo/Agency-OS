-- 056_gantt_flags.sql
-- Gantt por proyecto (Fase 1): activación (`gantt_enabled`, solo relevante en
-- type='project') + marca de "esta tarea/subtarea vive en el Gantt"
-- (`on_gantt`). El Gantt arranca vacío al activarse: ninguna tarea existente
-- se marca on_gantt=true automáticamente (ver Docs/superpowers/specs/2026-09-30-gantt-proyectos-design.md).

alter table public.work_items add column gantt_enabled boolean not null default false;
alter table public.work_items add column on_gantt boolean not null default false;
