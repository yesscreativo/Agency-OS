-- Logo de cliente. Se muestra junto al cliente en el sidebar de Proyectos.
-- El binario vive en el bucket PÚBLICO `client-logos` (los logos son activos de
-- marca, no sensibles; público evita firmar N URLs por render del sidebar).
-- La ESCRITURA sí se restringe por organización (primer segmento de la ruta,
-- <org_id>/<client_id>/<archivo>) y requiere `project.manage`, igual patrón que 020.

alter table public.clients add column logo_path text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('client-logos', 'client-logos', true, 2097152) -- 2 MB
on conflict (id) do nothing;

create policy "client_logos_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'client-logos'
    and public.current_user_has_permission('project.manage')
    and exists (
      select 1 from public.current_user_organization_ids() oid
      where oid::text = split_part(name, '/', 1)
    )
  );

create policy "client_logos_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'client-logos'
    and public.current_user_has_permission('project.manage')
    and exists (
      select 1 from public.current_user_organization_ids() oid
      where oid::text = split_part(name, '/', 1)
    )
  );

create policy "client_logos_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'client-logos'
    and public.current_user_has_permission('project.manage')
    and exists (
      select 1 from public.current_user_organization_ids() oid
      where oid::text = split_part(name, '/', 1)
    )
  );
