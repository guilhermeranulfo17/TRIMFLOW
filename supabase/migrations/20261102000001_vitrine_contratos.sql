-- Landing (nov/2026): a vitrine dos planos passa a dizer o limite de contratos por mês
-- (planos.contratos_mes, Etapa 10: Essencial 10 por mês; null = sem limite), para a página de
-- vendas não fixar esse número no código.
--
-- Aditivo: só uma chave nova no JSON. O código anterior ignora a chave; o novo trata a chave
-- ausente como "limite desconhecido" (não mostra número).

/**
 * Preços e limites dos planos à venda (sem ids, sem nada interno). A landing lê só daqui: anon
 * não lê planos nem cupons. Espelho dos tipos: domain/marketing/precos-vitrine.
 */
create or replace function publico.planos_vitrine()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'planos', coalesce((select jsonb_agg(jsonb_build_object(
        'codigo', p.codigo,
        'nome', p.nome,
        'preco_mensal_centavos', p.preco_mensal_centavos,
        'preco_anual_centavos', p.preco_anual_centavos,
        'max_usuarios', p.max_usuarios,
        'max_espacos', p.max_espacos,
        'whatsapp_avisos', p.whatsapp_avisos,
        'follow_up', p.follow_up,
        'numeros_completo', p.numeros_completo,
        'contratos_mes', p.contratos_mes) order by p.ordem, p.codigo)
      from public.planos p where p.ativo), '[]'));
$$;

revoke all on function publico.planos_vitrine() from public, anon, authenticated;
grant execute on function publico.planos_vitrine() to anon;
