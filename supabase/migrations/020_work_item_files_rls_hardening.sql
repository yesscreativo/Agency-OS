-- Hardening del bucket `work-item-files`: las políticas de 019 daban a CUALQUIER
-- usuario autenticado acceso a TODO el bucket (cross-tenant: podía listar/leer/
-- borrar archivos de otras organizaciones vía la API de Storage, saltándose las
-- server actions). Se re-scopean por organización usando el primer segmento de la
-- ruta (<org_id>/<work_item_id>/<uuid>-<archivo>) y se exige `project.manage`
-- para escribir. Ver también `briefs` (006_storage.sql), que tiene el mismo
-- patrón laxo y debería endurecerse aparte.

drop policy if exists "work_item_files_select_authenticated" on storage.objects;
drop policy if exists "work_item_files_insert_authenticated" on storage.objects;
drop policy if exists "work_item_files_update_authenticated" on storage.objects;
drop policy if exists "work_item_files_delete_authenticated" on storage.objects;

create policy "work_item_files_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'work-item-files'
    and exists (
      select 1 from public.current_user_organization_ids() oid
      where oid::text = split_part(name, '/', 1)
    )
  );

create policy "work_item_files_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'work-item-files'
    and public.current_user_has_permission('project.manage')
    and exists (
      select 1 from public.current_user_organization_ids() oid
      where oid::text = split_part(name, '/', 1)
    )
  );

create policy "work_item_files_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'work-item-files'
    and public.current_user_has_permission('project.manage')
    and exists (
      select 1 from public.current_user_organization_ids() oid
      where oid::text = split_part(name, '/', 1)
    )
  );

create policy "work_item_files_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'work-item-files'
    and public.current_user_has_permission('project.manage')
    and exists (
      select 1 from public.current_user_organization_ids() oid
      where oid::text = split_part(name, '/', 1)
    )
  );
