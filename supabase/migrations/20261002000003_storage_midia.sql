-- Etapa 2 · Bucket público "midia" (logo, capa e fotos de pacote).
-- Caminho: {empresa_id}/{logo|capa|pacotes}/{uuid}.webp
-- Leitura: pública pela URL do bucket. Escrita e exclusão: só o dono, na pasta da própria empresa.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('midia', 'midia', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Listar/baixar pela API (inclusive antes de apagar) só na pasta da própria empresa.
create policy midia_select_propria
  on storage.objects for select to authenticated
  using (
    bucket_id = 'midia'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
  );

create policy midia_insert_dono
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'midia'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    and (storage.foldername(name))[2] in ('logo', 'capa', 'pacotes')
    and public.perfil_do_usuario() = 'dono'
  );

create policy midia_update_dono
  on storage.objects for update to authenticated
  using (
    bucket_id = 'midia'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    and public.perfil_do_usuario() = 'dono'
  )
  with check (
    bucket_id = 'midia'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    and (storage.foldername(name))[2] in ('logo', 'capa', 'pacotes')
    and public.perfil_do_usuario() = 'dono'
  );

create policy midia_delete_dono
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'midia'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    and public.perfil_do_usuario() = 'dono'
  );
