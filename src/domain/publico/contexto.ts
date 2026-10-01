import { pacoteTemPreco, pendenciasDoLinkPublico, type Pendencia } from '../catalogo/pendencias';
import type { ContextoPreco } from '../preco';

/**
 * Link público calcula SEM deslocamento: a distância (CEP/km) fica para depois e o buffet
 * combina com o cliente. Evita o erro DISTANCIA_OBRIGATORIA para espaço no local do cliente.
 */
export function contextoSemDeslocamento(ctx: ContextoPreco): ContextoPreco {
  return { ...ctx, regras: { ...ctx.regras, deslocamentoModelo: 'nenhum' } };
}

/** Pendências do link a partir do contexto (o mesmo critério do menu Minha empresa). */
export function pendenciasDoContexto(ctx: ContextoPreco): Pendencia[] {
  return pendenciasDoLinkPublico({
    pacotes: ctx.pacotes.map((p) => ({
      ativo: p.ativo,
      modeloPreco: p.modeloPreco,
      precoPessoaCentavos: p.precoPessoaCentavos,
      valorExcedenteCentavos: p.valorExcedenteCentavos,
      quantidadeFaixas: p.faixasPreco.length,
    })),
    tiposEvento: ctx.tiposEvento,
    turnos: ctx.turnos,
    espacos: ctx.espacos,
  });
}

export { pacoteTemPreco };

/**
 * O que o link público enxerga do contexto do painel: só itens ativos (e faixas de idade da
 * empresa ou de pacotes ativos). Usado para provar que o contexto público é o mesmo do painel.
 */
export function somenteAtivos(ctx: ContextoPreco): ContextoPreco {
  const pacotesAtivos = new Set(ctx.pacotes.filter((p) => p.ativo).map((p) => p.id));
  return {
    ...ctx,
    tiposEvento: ctx.tiposEvento.filter((t) => t.ativo),
    espacos: ctx.espacos.filter((e) => e.ativo),
    turnos: ctx.turnos.filter((t) => t.ativo),
    pacotes: ctx.pacotes.filter((p) => p.ativo),
    opcionais: ctx.opcionais.filter((o) => o.ativo),
    faixasIdade: ctx.faixasIdade.filter(
      (f) => f.pacoteId === null || pacotesAtivos.has(f.pacoteId),
    ),
  };
}
