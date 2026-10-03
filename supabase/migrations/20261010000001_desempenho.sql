-- Etapa 9.5 · Desempenho (A.3 e A.6). Aditiva: índices, policies reescritas com a MESMA regra
-- e duas funções de leitura novas. Nada que o código anterior use muda.

-- ---------------------------------------------------------------------------------------------
-- 1. Índices nas chaves estrangeiras compostas (pai_id, empresa_id) usadas por junções, RLS e
--    exclusões: um índice por FK, nas colunas e na ordem da FK (o que o advisor do Supabase
--    reconhece). Nomes com sufixo _fk_idx para não colidir com índices antigos de mesmo nome.
--    Ficam de fora, de propósito, as FKs para usuarios (criado_por, feita_por…: usuário nunca é
--    excluído, só desativado), as FKs só de empresa_id e as do catálogo (tabelas pequenas).
-- ---------------------------------------------------------------------------------------------
create index if not exists leads_responsavel_fk_idx on public.leads (responsavel_id, empresa_id);
create index if not exists tarefas_lead_fk_idx on public.tarefas (lead_id, empresa_id);
create index if not exists tarefas_orcamento_fk_idx on public.tarefas (orcamento_id, empresa_id);
create index if not exists tarefas_responsavel_fk_idx on public.tarefas (responsavel_id, empresa_id);
create index if not exists atividades_lead_fk_idx on public.atividades (lead_id, empresa_id);
create index if not exists atividades_orcamento_fk_idx on public.atividades (orcamento_id, empresa_id);
create index if not exists avisos_lead_fk_idx on public.avisos (lead_id, empresa_id);
create index if not exists avisos_usuario_fk_idx on public.avisos (usuario_id, empresa_id);
create index if not exists avisos_entregas_aviso_fk_idx on public.avisos_entregas (aviso_id, empresa_id);
create index if not exists reservas_lead_fk_idx on public.reservas (lead_id, empresa_id);
create index if not exists reservas_orcamento_fk_idx on public.reservas (orcamento_id, empresa_id);
create index if not exists reservas_espaco_fk_idx on public.reservas (espaco_id, empresa_id);
create index if not exists reservas_turno_fk_idx on public.reservas (turno_id, empresa_id);
create index if not exists reservas_tipo_evento_fk_idx on public.reservas (tipo_evento_id, empresa_id);
create index if not exists orcamentos_lead_fk_idx on public.orcamentos (lead_id, empresa_id);
create index if not exists orcamentos_espaco_fk_idx on public.orcamentos (espaco_id, empresa_id);
create index if not exists orcamentos_turno_fk_idx on public.orcamentos (turno_id, empresa_id);
create index if not exists orcamentos_tipo_evento_fk_idx on public.orcamentos (tipo_evento_id, empresa_id);
create index if not exists notas_lead_fk_idx on public.notas (lead_id, empresa_id);
create index if not exists visitas_lead_fk_idx on public.visitas (lead_id, empresa_id);
create index if not exists visitas_orcamento_fk_idx on public.visitas (orcamento_id, empresa_id);
create index if not exists orcamento_itens_orcamento_fk_idx on public.orcamento_itens (orcamento_id, empresa_id);

-- ---------------------------------------------------------------------------------------------
-- 2. Policies com as funções dentro de (select …): o Postgres avalia uma vez por consulta, não
--    uma vez por linha. Mesma regra de antes; drop + create na mesma transação da migration.
-- ---------------------------------------------------------------------------------------------
drop policy if exists auditoria_insert_proprio on public.auditoria;
create policy auditoria_insert_proprio on public.auditoria for insert to authenticated
  with check (empresa_id = (select public.empresa_do_usuario())
              and usuario_id = (select auth.uid()));

drop policy if exists avisos_select_proprios on public.avisos;
create policy avisos_select_proprios on public.avisos for select to authenticated
  using (usuario_id = (select auth.uid()) and empresa_id = (select public.empresa_do_usuario()));

drop policy if exists avisos_entregas_select_proprias on public.avisos_entregas;
create policy avisos_entregas_select_proprias on public.avisos_entregas for select to authenticated
  using (exists (select 1 from public.avisos a
                 where a.id = aviso_id and a.usuario_id = (select auth.uid())
                   and a.empresa_id = (select public.empresa_do_usuario())));

drop policy if exists push_inscricoes_select_proprias on public.push_inscricoes;
create policy push_inscricoes_select_proprias on public.push_inscricoes for select to authenticated
  using (usuario_id = (select auth.uid()) and empresa_id = (select public.empresa_do_usuario()));

drop policy if exists preferencias_avisos_select_proprias on public.preferencias_avisos;
create policy preferencias_avisos_select_proprias on public.preferencias_avisos
  for select to authenticated
  using (usuario_id = (select auth.uid()) and empresa_id = (select public.empresa_do_usuario()));

-- ---------------------------------------------------------------------------------------------
-- 3. _lead_grupo e _lead_ordem ficam SEM "set search_path" de propósito (o advisor avisa):
--    qualquer SET numa função SQL impede o Postgres de embuti-la na consulta, e as duas rodam
--    por linha na caixa. Medido com 5.000 leads: caixa_leads 38 ms → 65 ms com o SET. Elas são
--    IMMUTABLE, só usam parâmetros e operadores de pg_catalog, não leem tabela: o search_path
--    de quem chama não muda o resultado. Ver docs/ARQUITETURA.md §60.
-- ---------------------------------------------------------------------------------------------

-- ---------------------------------------------------------------------------------------------
-- 4. Plano vigente da empresa do próprio usuário (limites e recursos, para qualquer perfil).
--    _plano_vigente continua fechada; este invólucro só responde pela empresa de quem chama.
-- ---------------------------------------------------------------------------------------------
create or replace function public.plano_vigente_da_empresa()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(p) from public._plano_vigente(public.empresa_do_usuario()) p
  where public.empresa_do_usuario() is not null;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Contexto do painel numa ida ao banco (layout: badges, sino, faixas, onboarding).
--    security invoker: tudo passa pelo RLS de quem chama. Não reimplementa regra nenhuma: chama
--    resumo_hoje() e plano_vigente_da_empresa() e devolve as linhas cruas que as regras puras do
--    TypeScript já usam (pendenciasDoLinkPublico, faixaDaConta, assinaturaDeReferencia).
-- ---------------------------------------------------------------------------------------------
create or replace function public.painel_contexto()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'resumo', (select to_jsonb(r) from public.resumo_hoje() r),
    'nao_lidos', (select count(*)::int from public.avisos a
                  where a.usuario_id = (select auth.uid()) and a.lido_em is null),
    'empresa', (select jsonb_build_object(
                  'plano', e.plano,
                  'trial_ate', e.trial_ate,
                  'fuso', e.fuso,
                  'onboarding_passo', e.onboarding_passo,
                  'onboarding_iniciado_em', e.onboarding_iniciado_em,
                  'onboarding_concluido_em', e.onboarding_concluido_em)
                from public.empresas e where e.id = (select public.empresa_do_usuario())),
    'catalogo', jsonb_build_object(
      'pacotes', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', p.id,
                    'ativo', p.ativo,
                    'modelo_preco', p.modelo_preco,
                    'preco_pessoa_centavos', p.preco_pessoa_centavos,
                    'valor_excedente_centavos', p.valor_excedente_centavos,
                    'preco_confirmado', p.preco_confirmado_em is not null,
                    'faixas', (select count(*)::int from public.faixas_preco f
                               where f.pacote_id = p.id)))
                  from public.pacotes p), '[]'::jsonb),
      'tipo_evento_ativo', exists (select 1 from public.tipos_evento t where t.ativo),
      'turno_ativo', exists (select 1 from public.turnos t where t.ativo),
      'espaco_ativo', exists (select 1 from public.espacos s where s.ativo)),
    -- só o dono lê assinaturas (RLS); para o vendedor a lista vem vazia
    'assinaturas', coalesce((select jsonb_agg(jsonb_build_object(
                      'status', a.status,
                      'pago_ate', a.pago_ate,
                      'atrasada_desde', a.atrasada_desde,
                      'criada_em', a.criada_em))
                    from public.assinaturas a), '[]'::jsonb),
    'plano', public.plano_vigente_da_empresa()
  );
$$;

revoke all on function public.plano_vigente_da_empresa() from public, anon;
grant execute on function public.plano_vigente_da_empresa() to authenticated;
revoke all on function public.painel_contexto() from public, anon;
grant execute on function public.painel_contexto() to authenticated;
