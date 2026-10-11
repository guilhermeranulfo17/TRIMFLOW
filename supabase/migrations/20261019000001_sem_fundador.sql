-- Sem preço de fundador: o cupom FUNDADOR deixa de valer e a landing para de anunciar as vagas.
-- Aditivo: o cupom fica desativado (não é apagado: cupons_usos e assinaturas guardam o
-- histórico) e publico.planos_vitrine deixa de devolver a chave 'fundador' (o código anterior
-- já trata a chave ausente como "sem faixa").

update public.cupons set ativo = false where upper(codigo) = 'FUNDADOR';

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
        'numeros_completo', p.numeros_completo) order by p.ordem, p.codigo)
      from public.planos p where p.ativo), '[]'));
$$;

revoke all on function publico.planos_vitrine() from public, anon, authenticated;
grant execute on function publico.planos_vitrine() to anon;
