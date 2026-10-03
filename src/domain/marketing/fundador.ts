import type { Centavos } from '../money';
import type { PlanoVitrine } from './precos-vitrine';

/*
 * Faixa "Vagas de fundador" da landing (Etapa 9.6). Só aparece com o cupom ativo, dentro da
 * validade e com vaga; valor e duração vêm do cupom e do plano (nada fixo).
 */

export type CupomFundador = {
  planoCodigo: string;
  ciclo: 'mensal' | 'anual';
  descontoCentavos: Centavos;
  duracaoMeses: number;
  /** null = sem limite */
  maxUsos: number | null;
  usos: number;
  validoAte: Date | null;
  ativo: boolean;
};

export type FaixaFundador = {
  planoNome: string;
  /** null quando o cupom não tem limite de usos */
  vagas: number | null;
  totalVagas: number | null;
  valorCentavos: Centavos;
  ciclo: 'mensal' | 'anual';
  meses: number;
};

export function faixaFundador(
  cupom: CupomFundador | null,
  planos: PlanoVitrine[],
  agora: Date,
): FaixaFundador | null {
  if (!cupom || !cupom.ativo) return null;
  if (cupom.validoAte && cupom.validoAte.getTime() < agora.getTime()) return null;
  const vagas = cupom.maxUsos === null ? null : Math.max(0, cupom.maxUsos - cupom.usos);
  if (vagas === 0) return null;
  const plano = planos.find((p) => p.codigo === cupom.planoCodigo);
  if (!plano) return null;
  const preco = cupom.ciclo === 'anual' ? plano.precoAnualCentavos : plano.precoMensalCentavos;
  const valor = preco - cupom.descontoCentavos;
  if (valor <= 0) return null;
  return {
    planoNome: plano.nome,
    vagas,
    totalVagas: cupom.maxUsos,
    valorCentavos: valor,
    ciclo: cupom.ciclo,
    meses: cupom.duracaoMeses,
  };
}
