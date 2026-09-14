-- Hardening del bucket `briefs`: las políticas de 006_storage.sql daban a
-- CUALQUIER usuario autenticado acceso a TODO el bucket (cross-tenant: podía
-- leer/subir/borrar briefs de otras organizaciones vía la API de Storage,
-- saltándose `uploadBrief`). Se re-scopean por organización uniendo contra
-- `quotes` (la ruta real es <quote_id>/<archivo>, no <org_id>/... como en
-- work-item-files) y se exige `quote.approve` para escribir, igual que
-- `uploadBrief`/`deleteQuote` en el código. Ver también 020_work_item_files_rls_hardening.sql,
-- que resolvió el mismo problema para ese otro bucket.

drop policy if exists "briefs_select_authenticated" on storage.objects;
drop policy if exists "briefs_insert_authenticated" on storage.objects;
drop policy if exists "briefs_update_authenticated" on storage.objects;
drop policy if exists "briefs_delete_authenticated" on storage.objects;

create policy "briefs_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'briefs'
    and exists (
      select 1 from public.quotes q
      where q.id::text = split_part(name, '/', 1)
        and q.organization_id in (select public.current_user_organization_ids())
    )
  );

create policy "briefs_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'briefs'
    and public.current_user_has_permission('quote.approve')
    and exists (
      select 1 from public.quotes q
      where q.id::text = split_part(name, '/', 1)
        and q.organization_id in (select public.current_user_organization_ids())
    )
  );

create policy "briefs_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'briefs'
    and public.current_user_has_permission('quote.approve')
    and exists (
      select 1 from public.quotes q
      where q.id::text = split_part(name, '/', 1)
        and q.organization_id in (select public.current_user_organization_ids())
    )
  );

create policy "briefs_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'briefs'
    and public.current_user_has_permission('quote.approve')
    and exists (
      select 1 from public.quotes q
      where q.id::text = split_part(name, '/', 1)
        and q.organization_id in (select public.current_user_organization_ids())
    )
  );
