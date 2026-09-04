-- Adjuntos en comentarios. Un adjunto puede colgar de la TAREA (comment_id null,
-- comportamiento actual) o de un COMENTARIO (comment_id set). Se reutiliza la
-- tabla work_item_attachments y el bucket privado work-item-files.

alter table public.work_item_attachments
  add column comment_id uuid references public.work_item_comments(id) on delete cascade;

create index work_item_attachments_comment_id_idx
  on public.work_item_attachments(comment_id)
  where comment_id is not null;

-- Comentar solo requiere `project.view`, pero adjuntar un archivo al comentario
-- necesita escribir en el bucket, cuya policy de INSERT (020) exigía
-- `project.manage`. Se relaja a "miembro de la organización" (mismo scope que el
-- SELECT). El gate estricto de los adjuntos de TAREA sigue en la server action
-- (requireProjectManager); los de comentario se gatean por autor + project.view.
drop policy if exists "work_item_files_insert" on storage.objects;
create policy "work_item_files_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'work-item-files'
    and exists (
      select 1 from public.current_user_organization_ids() oid
      where oid::text = split_part(name, '/', 1)
    )
  );
