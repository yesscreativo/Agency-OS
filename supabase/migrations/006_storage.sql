-- Bucket privado para briefs de cotizaciones. Ruta convenida: <quote_id>/<archivo>.
-- Se accede vía signed URLs generadas server-side; límite 10 MB (paridad con
-- validateBriefSize del dominio).
insert into storage.buckets (id, name, public, file_size_limit)
values ('briefs', 'briefs', false, 10485760)
on conflict (id) do nothing;

-- Usuarios autenticados de la organización gestionan briefs; anon no ve nada.
create policy "briefs_select_authenticated" on storage.objects
  for select to authenticated using (bucket_id = 'briefs');

create policy "briefs_insert_authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'briefs');

create policy "briefs_update_authenticated" on storage.objects
  for update to authenticated using (bucket_id = 'briefs');

create policy "briefs_delete_authenticated" on storage.objects
  for delete to authenticated using (bucket_id = 'briefs');
