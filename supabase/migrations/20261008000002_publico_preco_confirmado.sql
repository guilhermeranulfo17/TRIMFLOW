-- Etapa 8 · Link público só com preço confirmado + valores novos de enum.
--
-- Valores novos de enum ficam aqui, separados das funções que os usam (migration 3): um valor
-- adicionado não pode ser usado na mesma transação. O código da Etapa 7 nunca manda esses valores.
alter type public.origem_lead add value if not exists 'qrcode';
alter type public.evento_funil add value if not exists 'pagina_vista';

-- contexto_preco: mesma assinatura; pacote ou opcional sem preço confirmado (preço de exemplo
-- do modelo) não entra no link. A migration 1 confirmou tudo o que já existia.
/**
 * Catálogo ATIVO E COM PREÇO CONFIRMADO + regras, para o servidor montar o ContextoPreco (mesmo mapper do painel).
 * Inclui preços: NUNCA é serializado para o navegador; o servidor monta a vitrine conforme o
 * modo de exibição de preço.
 */
create or replace function publico.contexto_preco(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e public.empresas;
begin
  v_e := publico._empresa_ativa(p_slug);
  return jsonb_build_object(
    'fuso', v_e.fuso,
    'hoje', publico._hoje(v_e.id),
    'regras', (select to_jsonb(r) - 'empresa_id' from public.regras_comerciais r where r.empresa_id = v_e.id),
    'tipos_evento', coalesce((select jsonb_agg(to_jsonb(t) - 'empresa_id' order by t.ordem, t.nome)
      from public.tipos_evento t where t.empresa_id = v_e.id and t.ativo), '[]'),
    'espacos', coalesce((select jsonb_agg(to_jsonb(x) - 'empresa_id' order by x.ordem, x.nome)
      from public.espacos x where x.empresa_id = v_e.id and x.ativo), '[]'),
    'turnos', coalesce((select jsonb_agg(to_jsonb(t) - 'empresa_id' order by t.ordem, t.hora_inicio)
      from public.turnos t where t.empresa_id = v_e.id and t.ativo), '[]'),
    'ajustes_dia', coalesce((select jsonb_agg(to_jsonb(a) - 'empresa_id')
      from public.ajustes_dia a where a.empresa_id = v_e.id), '[]'),
    'feriados', coalesce((select jsonb_agg(to_jsonb(f) - 'empresa_id' order by f.data)
      from public.feriados f where f.empresa_id = v_e.id), '[]'),
    'faixas_idade', coalesce((select jsonb_agg(to_jsonb(f) - 'empresa_id' order by f.idade_min)
      from public.faixas_idade f
      where f.empresa_id = v_e.id
        and (f.pacote_id is null or exists (
          select 1 from public.pacotes p where p.id = f.pacote_id and p.ativo and p.preco_confirmado_em is not null))), '[]'),
    'pacotes', coalesce((select jsonb_agg(to_jsonb(p) - 'empresa_id' order by p.ordem, p.nome)
      from public.pacotes p where p.empresa_id = v_e.id and p.ativo and p.preco_confirmado_em is not null), '[]'),
    'faixas_preco', coalesce((select jsonb_agg(to_jsonb(f) - 'empresa_id' order by f.ate_convidados)
      from public.faixas_preco f join public.pacotes p on p.id = f.pacote_id and p.ativo and p.preco_confirmado_em is not null
      where f.empresa_id = v_e.id), '[]'),
    'secoes_cardapio', coalesce((select jsonb_agg(to_jsonb(s) - 'empresa_id' order by s.ordem)
      from public.secoes_cardapio s join public.pacotes p on p.id = s.pacote_id and p.ativo and p.preco_confirmado_em is not null
      where s.empresa_id = v_e.id), '[]'),
    'pacote_tipos_evento', coalesce((select jsonb_agg(to_jsonb(v) - 'empresa_id')
      from public.pacote_tipos_evento v where v.empresa_id = v_e.id), '[]'),
    'opcionais', coalesce((select jsonb_agg(to_jsonb(o) - 'empresa_id' order by o.ordem, o.nome)
      from public.opcionais o where o.empresa_id = v_e.id and o.ativo and o.preco_confirmado_em is not null), '[]'),
    'opcional_pacotes', coalesce((select jsonb_agg(to_jsonb(v) - 'empresa_id')
      from public.opcional_pacotes v where v.empresa_id = v_e.id), '[]'),
    'opcional_tipos_evento', coalesce((select jsonb_agg(to_jsonb(v) - 'empresa_id')
      from public.opcional_tipos_evento v where v.empresa_id = v_e.id), '[]'),
    'faixas_deslocamento', coalesce((select jsonb_agg(to_jsonb(d) - 'empresa_id' order by d.ate_km)
      from public.faixas_deslocamento d where d.empresa_id = v_e.id), '[]')
  );
end;
$$;
