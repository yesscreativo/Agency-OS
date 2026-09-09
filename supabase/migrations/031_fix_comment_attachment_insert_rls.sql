-- Bug: subir un adjunto a un COMENTARIO fallaba con "No se pudo subir el
-- archivo. Intenta de nuevo." para cualquiera sin project.manage (ej. un
-- colaborador que solo comenta, o el rol proyectos_colaborador). La migración
-- 025 relajó la policy de STORAGE para permitir el upload del binario a
-- cualquier miembro de la organización, pero dejó intacta la policy de la
-- TABLA work_item_attachments (`for all using (... and project.manage)`), que
-- sigue aplicando a INSERT/UPDATE/DELETE — el archivo subía al bucket pero la
-- fila de metadata nunca se insertaba (RLS la rechazaba en silencio, capturada
-- por el catch genérico de la action). Se separa la policy en INSERT/UPDATE/
-- DELETE, relajando el caso de adjuntos de COMENTARIO (comment_id not null)
-- para que el propio autor pueda subir/borrar los suyos — igual que ya exige
-- el gate de las server actions (uploadCommentAttachment/deleteCommentAttachment).

drop policy if exists work_item_attachments_write on public.work_item_attachments;

create policy work_item_attachments_insert on public.work_item_attachments
  for insert to authenticated
  with check (
    organization_id in (select public.current_user_organization_ids())
    and (
      public.current_user_has_permission('project.manage')
      or (comment_id is not null and created_by = auth.uid())
    )
  );

create policy work_item_attachments_update on public.work_item_attachments
  for update to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
    and (
      public.current_user_has_permission('project.manage')
      or (comment_id is not null and created_by = auth.uid())
    )
  );

create policy work_item_attachments_delete on public.work_item_attachments
  for delete to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
    and (
      public.current_user_has_permission('project.manage')
      or (comment_id is not null and created_by = auth.uid())
    )
  );
