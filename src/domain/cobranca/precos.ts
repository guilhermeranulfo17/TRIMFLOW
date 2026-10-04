import { type DataCivil, somarDias, somarMeses } from '../dates';

/*
 * Preço da assinatura por plano, ciclo e cupom. Tudo em centavos.
 * Cupom: desconto fixo sobre o preço do ciclo durante `duracaoMeses` a partir do 1º vencimento.
 */

export type Ciclo = 'mensal' | 'anual';

/** Implantação assistida (cobrança avulsa pelo /interno). A landing mostra este mesmo valor. */
export const VALOR_IMPLANTACAO_CENTAVOS = 49_700;

/** Dias do teste grátis. Espelho de `trial_ate = now() + interval '14 days'` em _criar_conta_dono. */
export const DIAS_TESTE_GRATIS = 14;

export type PrecosPlano = {
  codigo: string;
  nome: string;
  precoMensalCentavos: number;
  precoAnualCentavos: number;
};

export type Cupom = {
  codigo: string;
  planoCodigo: string;
  ciclo: Ciclo;
  descontoCentavos: number;
  duracaoMeses: number;
  maxUsos: number | null;
  usos: number;
  validoAte: Date | null;
  ativo: boolean;
};

export const precoDoCiclo = (p: PrecosPlano, ciclo: Ciclo): number =>
  ciclo === 'anual' ? p.precoAnualCentavos : p.precoMensalCentavos;

/** Quantos meses de graça o anual dá frente a 12 mensalidades (2 = "2 meses grátis"). */
export function mesesGratisNoAnual(p: PrecosPlano): number {
  const economia = p.precoMensalCentavos * 12 - p.precoAnualCentavos;
  return economia > 0 ? Math.floor(economia / p.precoMensalCentavos) : 0;
}

export const normalizarCodigoCupom = (codigo: string): string =>
  codigo
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');

export type ResultadoCupom = { ok: true; cupom: Cupom } | { ok: false; erro: string };

export function validarCupom(
  cupom: Cupom | null,
  o: { plano: string; ciclo: Ciclo; agora: Date; jaUsou: boolean },
): ResultadoCupom {
  if (!cupom || !cupom.ativo) return { ok: false, erro: 'Cupom não encontrado.' };
  if (cupom.validoAte && cupom.validoAte.getTime() < o.agora.getTime()) {
    return { ok: false, erro: 'Este cupom expirou.' };
  }
  if (cupom.maxUsos !== null && cupom.usos >= cupom.maxUsos) {
    return { ok: false, erro: 'Este cupom já foi usado por todas as vagas.' };
  }
  if (o.jaUsou) return { ok: false, erro: 'Sua empresa já usou este cupom.' };
  if (cupom.planoCodigo !== o.plano || cupom.ciclo !== o.ciclo) {
    const ciclo = cupom.ciclo === 'anual' ? 'anual' : 'mensal';
    return {
      ok: false,
      erro: `Este cupom vale só para o plano ${rotuloCodigo(cupom.planoCodigo)} ${ciclo}.`,
    };
  }
  return { ok: true, cupom };
}

const rotuloCodigo = (codigo: string) => codigo.charAt(0).toUpperCase() + codigo.slice(1);

/** Valor de cada cobrança: o preço do ciclo menos o desconto do cupom (nunca negativo). */
export function valorDaAssinatura(p: PrecosPlano, ciclo: Ciclo, cupom: Cupom | null): number {
  return Math.max(0, precoDoCiclo(p, ciclo) - (cupom?.descontoCentavos ?? 0));
}

/** Último dia com desconto: 1º vencimento + duração - 1 dia. */
export function fimDoCupom(primeiroVencimento: DataCivil, duracaoMeses: number): DataCivil {
  return somarDias(somarMeses(primeiroVencimento, duracaoMeses), -1);
}

/** Último dia coberto por uma cobrança paga: vencimento + 1 ciclo - 1 dia. */
export function pagoAteDaCobranca(vencimento: DataCivil, ciclo: Ciclo): DataCivil {
  return somarDias(somarMeses(vencimento, ciclo === 'anual' ? 12 : 1), -1);
}

/** 1º vencimento ao assinar: hoje ou o fim do teste, o que vier depois (não perde dias). */
export function primeiroVencimento(hoje: DataCivil, fimDoTeste: DataCivil | null): DataCivil {
  return fimDoTeste && fimDoTeste > hoje ? fimDoTeste : hoje;
}
