-- Vídeo de ONBOARDING: apaga a conta de demonstração "Buffet Girassol" para a gravação começar do
-- zero (o próprio vídeo cria a conta pelo /cadastro). Só banco LOCAL. Nunca rode em produção.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/seed-video-onboarding.sql
--
-- Conta criada na gravação (fictícia):
--   e-mail: dono@girassol.local
--   senha:  girassol-video-2026
begin;
select set_config('orkestra.permitir_escrita', '1', true);
do $$
declare
  v_empresa uuid;
  v_usuario uuid;
  t text;
begin
  select id into v_usuario from auth.users where email = 'dono@girassol.local';
  select empresa_id into v_empresa from public.usuarios where id = v_usuario;
  if v_empresa is null then
    select id into v_empresa from public.empresas where slug = 'buffet-girassol';
  end if;
  set local session_replication_role = replica;
  if v_empresa is not null then
    for t in
      select c.table_name from information_schema.columns c
      join information_schema.tables tb using (table_schema, table_name)
      where c.table_schema = 'public' and c.column_name = 'empresa_id' and tb.table_type = 'BASE TABLE'
    loop
      execute format('delete from public.%I where empresa_id = %L', t, v_empresa);
    end loop;
    delete from public.empresas where id = v_empresa;
  end if;
  if v_usuario is not null then
    delete from auth.identities where user_id = v_usuario;
    delete from auth.sessions where user_id = v_usuario;
    delete from auth.users where id = v_usuario;
  end if;
  set local session_replication_role = origin;
end;
$$;
truncate publico.tentativas;
commit;
