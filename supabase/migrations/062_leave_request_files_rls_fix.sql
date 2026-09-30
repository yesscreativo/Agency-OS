-- 062_leave_request_files_rls_fix.sql
-- Hardening del bucket `leave-request-files`: las políticas de 061 daban a
-- CUALQUIER usuario autenticado acceso de lectura/escritura a TODO el bucket
-- (cross-tenant, y dentro de la misma organización cualquier colega podía leer
-- el documento de una licencia médica ajena). Encontrado por la revisión de
-- seguridad automática. Mismo tipo de problema que 020_work_item_files_rls_hardening.sql,
-- pero acá se va más estricto que ese precedente (scope por organización) porque
-- el contenido es más sensible (documentos médicos): el select se scopea a
-- quién realmente puede ver ESA solicitud puntual (solicitante/jefe/RRHH), no
-- solo "misma organización".

drop policy if exists "leave_request_files_select_authenticated" on storage.objects;
drop policy if exists "leave_request_files_insert_authenticated" on storage.objects;

create policy "leave_request_files_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'leave-request-files'
    and exists (
      select 1 from public.leave_requests lr
      where lr.attachment_path = storage.objects.name
        and lr.organization_id in (select public.current_user_organization_ids())
        and (
          lr.requester_user_id = auth.uid()
          or lr.manager_user_id = auth.uid()
          or public.current_user_has_permission('leave.approve_hr')
        )
    )
  );

-- Insert ocurre ANTES de crear la fila de leave_requests (se sube el archivo,
-- después se inserta la solicitud con attachment_path ya resuelto) — no hay
-- fila todavía contra la cual validar. Se exige en su lugar que la ruta
-- (<org_id>/<user_id>/<uuid>-<archivo>) tenga como primer segmento la propia
-- organización y como segundo segmento el propio usuario.
create policy "leave_request_files_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'leave-request-files'
    and exists (
      select 1 from public.current_user_organization_ids() oid
      where oid::text = split_part(name, '/', 1)
    )
    and split_part(name, '/', 2) = auth.uid()::text
  );
