import type { ContextoPreco, FaixaIdadeCtx, Id } from './tipos';

/** Faixas de idade que valem para o pacote: as do pacote, se existirem; senão, as da empresa. */
export function faixasIdadeAplicaveis(
  contexto: ContextoPreco,
  pacoteId: Id | null,
): FaixaIdadeCtx[] {
  const doPacote = pacoteId ? contexto.faixasIdade.filter((f) => f.pacoteId === pacoteId) : [];
  const faixas =
    doPacote.length > 0 ? doPacote : contexto.faixasIdade.filter((f) => f.pacoteId === null);
  return [...faixas].sort((a, b) => a.idadeMin - b.idadeMin);
}

/**
 * Resolve a faixa usada no cálculo. Aceita o id de uma faixa aplicável ou de uma faixa da
 * empresa quando o pacote tem política própria: nesse caso usa a faixa do pacote que contém
 * a idade mínima da faixa da empresa (o cliente informa as crianças antes de escolher o pacote).
 */
export function resolverFaixaIdade(
  contexto: ContextoPreco,
  aplicaveis: FaixaIdadeCtx[],
  faixaIdadeId: Id,
): FaixaIdadeCtx | null {
  const direta = aplicaveis.find((f) => f.id === faixaIdadeId);
  if (direta) return direta;
  const daEmpresa = contexto.faixasIdade.find((f) => f.id === faixaIdadeId && f.pacoteId === null);
  if (!daEmpresa) return null;
  return (
    aplicaveis.find(
      (f) =>
        f.idadeMin <= daEmpresa.idadeMin &&
        (f.idadeMax === null || daEmpresa.idadeMin <= f.idadeMax),
    ) ?? null
  );
}

export type ContagemConvidados = {
  equivalentes: number;
  pessoasFisicas: number;
  /** índices de `criancas` cuja faixa não existe */
  faixasInvalidas: number[];
};

/**
 * Convidados equivalentes = adultos + Σ(quantidade × fator_bp ÷ 10000), arredondado para cima
 * no final. Pessoas físicas = adultos + Σ quantidade. Só aritmética inteira.
 */
export function contarConvidados(
  contexto: ContextoPreco,
  pacoteId: Id | null,
  adultos: number,
  criancas: { faixaIdadeId: Id; quantidade: number }[],
): ContagemConvidados {
  const aplicaveis = faixasIdadeAplicaveis(contexto, pacoteId);
  let totalBp = adultos * 10_000;
  let pessoasFisicas = adultos;
  const faixasInvalidas: number[] = [];
  criancas.forEach((c, i) => {
    pessoasFisicas += c.quantidade;
    const faixa = resolverFaixaIdade(contexto, aplicaveis, c.faixaIdadeId);
    if (!faixa) {
      faixasInvalidas.push(i);
      return;
    }
    totalBp += c.quantidade * faixa.fatorBp;
  });
  return { equivalentes: Math.floor((totalBp + 9_999) / 10_000), pessoasFisicas, faixasInvalidas };
}
