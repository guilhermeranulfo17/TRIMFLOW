-- Item 3 · VERIFICAÇÃO (somente leitura). As mesmas contas do advisor.

-- 1. Funções SECURITY DEFINER do public executáveis por authenticated (eram 87; todas revisadas:
--    docs/SEGURANCA_FUNCOES.md). Depois do passo 3.2 (tirar o public da API), o advisor zera.
select count(*) as funcoes_authenticated,
       count(*) filter (where has_function_privilege('anon', p.oid, 'execute')) as executaveis_por_anon,
       count(*) filter (where not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                                          where c like 'search_path=%')) as sem_search_path
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prosecdef
  and has_function_privilege('authenticated', p.oid, 'execute');

-- 2. Tabelas com RLS e sem policy (8, todas só do servidor) e se alguém tem GRANT nelas
select n.nspname || '.' || c.relname as tabela,
       has_table_privilege('anon', c.oid, 'select') as anon_le,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_le,
       left(obj_description(c.oid, 'pg_class'), 80) as comentario
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname in ('public', 'publico') and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
order by 1;

-- 3. Schema do pg_net (esperado depois da migration 20261120000004: extensions)
select x.extname, n.nspname as schema from pg_extension x join pg_namespace n on n.oid = x.extnamespace
where x.extname in ('pg_net', 'pg_cron', 'pgcrypto', 'btree_gist');
