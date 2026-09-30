-- 058_work_item_attachments_visibility.sql
-- Paridad con work_item_comments.visibility (023_work_item_comments_activity.sql):
-- permite marcar un adjunto como visible para el cliente en el link público
-- del Gantt (ver Docs/superpowers/specs/2026-09-30-gantt-proyectos-design.md §6).

alter table public.work_item_attachments add column visibility text not null default 'internal';
alter table public.work_item_attachments add constraint work_item_attachments_visibility_check
  check (visibility in ('internal', 'client_visible'));
