-- Proyectos / Work Items — adjuntos de tareas.
-- Varios archivos por work item (referencias visuales u otros). El binario vive
-- en el bucket privado `work-item-files` (ruta <work_item_id>/<uuid>-<archivo>);
-- la fila guarda metadatos + ruta. El acceso se hace vía signed URLs generadas
-- server-side (mismo patrón que el bucket `briefs`, ver 006_storage.sql).

create table public.work_item_attachments (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  path text not null,
  filename text not null,
  mime_type text,
  size_bytes integer,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index work_item_attachments_item_idx on public.work_item_attachments(work_item_id);

-- RLS (patrón work_items): ver dentro de la organización; escribir requiere project.manage.
alter table public.work_item_attachments enable row level security;

create policy work_item_attachments_select on public.work_item_attachments
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy work_item_attachments_write on public.work_item_attachments
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('project.manage')
  );

-- Bucket privado (límite 10 MB, paridad con `briefs`).
insert into storage.buckets (id, name, public, file_size_limit)
values ('work-item-files', 'work-item-files', false, 10485760)
on conflict (id) do nothing;

create policy "work_item_files_select_authenticated" on storage.objects
  for select to authenticated using (bucket_id = 'work-item-files');
create policy "work_item_files_insert_authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'work-item-files');
create policy "work_item_files_update_authenticated" on storage.objects
  for update to authenticated using (bucket_id = 'work-item-files');
create policy "work_item_files_delete_authenticated" on storage.objects
  for delete to authenticated using (bucket_id = 'work-item-files');
