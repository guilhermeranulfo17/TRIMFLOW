-- Ajustes da análise de 17/11/2026 · Item 3: pg_net fora do schema public (§99).
--
-- O advisor "extension_in_public" aponta o pg_net registrado no schema public (as migrations
-- antigas faziam `create extension if not exists pg_net` sem schema). O pg_net não aceita
-- ALTER EXTENSION ... SET SCHEMA; o caminho indicado pelo Supabase é recriar no schema
-- extensions. As funções do pg_net continuam no schema `net` (net.http_post), que é o que os
-- jobs chamam (sempre por SQL dinâmico, sem dependência registrada), então nada muda para eles.
-- Perde-se só a fila de respostas HTTP em memória do pg_net (net._http_response), que é
-- descartável: os jobs rodam de novo no próximo minuto.
--
-- Seguro em qualquer banco: sem pg_net (Postgres dos testes) ou já fora do public, não faz nada.
-- Se o DROP falhar por algum motivo (dependência inesperada), a migration NÃO quebra o deploy:
-- avisa e deixa como está (a recriação fica para um passo manual revisado).

do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension x join pg_namespace n on n.oid = x.extnamespace
  where x.extname = 'pg_net';
  if v_schema is distinct from 'public' then
    raise notice 'pg_net: nada a fazer (schema atual: %).', coalesce(v_schema, 'não instalado');
    return;
  end if;
  begin
    create schema if not exists extensions;
    drop extension pg_net;
    create extension pg_net with schema extensions;
    raise notice 'pg_net recriado no schema extensions.';
  exception when others then
    raise notice 'pg_net: não foi possível mover (%). Ficou no public.', sqlerrm;
  end;
end;
$$;
