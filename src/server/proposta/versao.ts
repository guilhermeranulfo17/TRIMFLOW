import { somarDias } from '@/domain/dates';
import type { ContextoPreco, ResultadoOrcamento } from '@/domain/preco';
import { congelarConteudo, type ConteudoCongelado, type TextosComerciais } from '@/domain/proposta';
import type { Escolhas } from '@/domain/publico';

/*
 * Monta o que é gravado numa versão: itens (cópia das linhas do motor, com a referência ao
 * catálogo), campos denormalizados, validade e o conteúdo congelado. Usado pelo wizard, pela
 * atualização de preços e pelo orçamento interno. Sem banco: só transforma.
 */

export type DadosVersao = {
  resultado: ResultadoOrcamento;
  itens: {
    tipo: string;
    descricao: string;
    quantidade: number;
    valorUnitarioCentavos: number;
    subtotalCentavos: number;
    detalhe: string;
    referenciaId?: string;
  }[];
  campos: {
    tipoEventoId: string;
    data: string;
    turnoId: string;
    espacoId: string;
    convidados: number;
    pacoteId: string | null;
  };
  validade: string;
  conteudo: ConteudoCongelado;
};

export function prepararVersao(d: {
  ctx: ContextoPreco;
  escolhas: Escolhas;
  resultado: ResultadoOrcamento;
  hoje: string;
  textos: TextosComerciais;
  aberturaModelo: string | null;
  clienteNome: string;
  buffetNome: string;
}): DadosVersao {
  const { ctx, escolhas: e, resultado } = d;
  const ativos = ctx.espacos.filter((x) => x.ativo);
  const espacoId = ativos.length === 1 ? ativos[0]!.id : e.espacoId!;
  const pessoas = (e.adultos ?? 0) + e.criancas.reduce((n, c) => n + c.quantidade, 0);
  return {
    resultado,
    itens: resultado.linhas.map((l) => ({
      tipo: l.tipo,
      descricao: l.descricao,
      quantidade: l.quantidade,
      valorUnitarioCentavos: l.valorUnitarioCentavos,
      subtotalCentavos: l.subtotalCentavos,
      detalhe: l.detalhe,
      ...(l.referenciaId ? { referenciaId: l.referenciaId } : {}),
    })),
    campos: {
      tipoEventoId: e.tipoEventoId!,
      data: e.data!,
      turnoId: e.turnoId!,
      espacoId,
      convidados: Math.max(1, pessoas),
      pacoteId: e.pacoteId ?? null,
    },
    validade: somarDias(d.hoje, ctx.regras.validadeDias),
    conteudo: congelarConteudo({
      ctx,
      escolhas: e,
      textos: d.textos,
      aberturaModelo: d.aberturaModelo,
      clienteNome: d.clienteNome,
      buffetNome: d.buffetNome,
    }),
  };
}
