-- Avatar del usuario. La columna `people.avatar_url` ya existe (001_core.sql);
-- guardamos ahí la RUTA del archivo dentro del bucket PÚBLICO `user-avatars`
-- (los avatares no son sensibles; público evita firmar una URL por cada avatar
-- renderizado en comentarios/asignados/tablero). Al leer se calcula getPublicUrl.
--
-- La ESCRITURA se restringe al DUEÑO: el primer segmento de la ruta es el
-- auth.uid() del usuario (<uid>/<uuid>-<archivo>). SVG se excluye en la capa de
-- aplicación (bucket público → XSS), igual que en client-logos (022).

insert into storage.buckets (id, name, public, file_size_limit)
values ('user-avatars', 'user-avatars', true, 2097152) -- 2 MB
on conflict (id) do nothing;

create policy "user_avatars_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'user-avatars' and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "user_avatars_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'user-avatars' and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "user_avatars_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'user-avatars' and split_part(name, '/', 1) = auth.uid()::text
  );
