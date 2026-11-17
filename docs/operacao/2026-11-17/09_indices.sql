-- Item 9 · VERIFICAÇÃO (somente leitura). Para reavaliar quando houver tráfego real.

-- 1. Índices nunca usados desde o último reset de estatísticas (eram 51). NÃO apagar ainda:
--    com volume baixo quase todo índice parece "nunca usado". Reavaliar com 2 a 3 meses de uso,
--    olhando também o tamanho (só vale apagar o que é grande e continua com idx_scan = 0).
select s.schemaname, s.relname as tabela, s.indexrelname as indice, s.idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) as tamanho,
       i.indisunique as unico
from pg_stat_user_indexes s join pg_index i on i.indexrelid = s.indexrelid
where s.schemaname in ('public', 'publico') and s.idx_scan = 0
order by pg_relation_size(s.indexrelid) desc, 2, 3;

-- Desde quando as estatísticas contam
select stats_reset from pg_stat_database where datname = current_database();

-- 2. FKs sem índice de cobertura exata (eram 43; depois da migration 20261120000008, 39).
--    "primeira_coluna_indexada = true" = já há índice na 1ª coluna da FK (serve para join e
--    ON DELETE; o advisor só reclama da cobertura exata da FK composta).
select c.conrelid::regclass as tabela, c.conname as fk,
       (select string_agg(a.attname, ', ' order by k.o) from unnest(c.conkey) with ordinality k(n, o)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n) as colunas,
       exists (select 1 from pg_index i where i.indrelid = c.conrelid
               and (i.indkey::int2[])[0] = c.conkey[1]) as primeira_coluna_indexada
from pg_constraint c
where c.contype = 'f' and c.connamespace in ('public'::regnamespace, 'publico'::regnamespace)
  and not exists (
    select 1 from pg_index i where i.indrelid = c.conrelid
      and (select array_agg(x order by x) from unnest((i.indkey::int2[])[0:array_length(c.conkey, 1) - 1]) x)
        = (select array_agg(x order by x) from unnest(c.conkey) x))
order by 1, 2;
