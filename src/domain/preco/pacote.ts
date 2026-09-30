import { formatBRL } from '../money';
import type { ContextoPreco, Id, PacoteCtx } from './tipos';

export type ValorPacote = {
  subtotalCentavos: number;
  quantidade: number;
  valorUnitarioCentavos: number;
  detalhe: string;
};

function plural(n: number, singular: string, pluralTxt: string) {
  return `${n} ${n === 1 ? singular : pluralTxt}`;
}

export function descreverEquivalentes(n: number) {
  return plural(n, 'convidado equivalente', 'convidados equivalentes');
}

/**
 * Valor do pacote para N convidados equivalentes.
 * - por_pessoa: equivalentes × preço por pessoa.
 * - por_faixa: menor faixa com `ateConvidados ≥ equivalentes`; acima da maior faixa,
 *   valor da maior + excedente por convidado.
 * Retorna null quando o pacote não tem preço configurado.
 */
export function valorDoPacote(pacote: PacoteCtx, equivalentes: number): ValorPacote | null {
  if (pacote.modeloPreco === 'por_pessoa') {
    if (pacote.precoPessoaCentavos === null) return null;
    return {
      subtotalCentavos: equivalentes * pacote.precoPessoaCentavos,
      quantidade: equivalentes,
      valorUnitarioCentavos: pacote.precoPessoaCentavos,
      detalhe: `${descreverEquivalentes(equivalentes)} × ${formatBRL(pacote.precoPessoaCentavos)}`,
    };
  }

  const faixas = [...pacote.faixasPreco].sort((a, b) => a.ateConvidados - b.ateConvidados);
  const maior = faixas.at(-1);
  if (!maior || pacote.valorExcedenteCentavos === null) return null;

  const faixa = faixas.find((f) => f.ateConvidados >= equivalentes);
  if (faixa) {
    return {
      subtotalCentavos: faixa.valorCentavos,
      quantidade: 1,
      valorUnitarioCentavos: faixa.valorCentavos,
      detalhe: `${descreverEquivalentes(equivalentes)}: faixa até ${faixa.ateConvidados}`,
    };
  }

  const excedentes = equivalentes - maior.ateConvidados;
  const subtotal = maior.valorCentavos + excedentes * pacote.valorExcedenteCentavos;
  return {
    subtotalCentavos: subtotal,
    quantidade: 1,
    valorUnitarioCentavos: subtotal,
    detalhe:
      `${descreverEquivalentes(equivalentes)}: faixa até ${maior.ateConvidados} + ` +
      `${excedentes} × ${formatBRL(pacote.valorExcedenteCentavos)}`,
  };
}

/** Pacote vale para o tipo de evento? (sem vínculos = vale para todos) */
export function pacoteValeParaTipo(pacote: PacoteCtx, tipoEventoId: Id): boolean {
  return pacote.tiposEventoIds.length === 0 || pacote.tiposEventoIds.includes(tipoEventoId);
}

export function buscarAtivo<T extends { id: Id; ativo: boolean }>(lista: T[], id: Id): T | null {
  return lista.find((x) => x.id === id && x.ativo) ?? null;
}

export function pacotesAtivos(contexto: ContextoPreco): PacoteCtx[] {
  return contexto.pacotes.filter((p) => p.ativo).sort((a, b) => a.ordem - b.ordem);
}
