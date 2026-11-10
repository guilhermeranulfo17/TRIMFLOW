import { formatBRL, type Centavos } from '../money';

/*
 * Preço da landing. Os dados vêm de publico.planos_vitrine(); aqui só as regras de exibição. A
 * landing mostra UM preço: a mensalidade do plano que o teste grátis usa (o mesmo código de
 * `codigoPlanoVigente` no trial). Nada de valor fixo: sai dos dados do banco.
 */

export type PlanoVitrine = {
  codigo: string;
  nome: string;
  precoMensalCentavos: Centavos;
  precoAnualCentavos: Centavos;
  maxUsuarios: number;
  /** null = ilimitado */
  maxEspacos: number | null;
  whatsappAvisos: boolean;
  followUp: boolean;
  numerosCompleto: boolean;
  /** contratos enviados por mês: null = sem limite; undefined = a vitrine não informou */
  contratosMes?: number | null;
};

/** O plano à venda na landing (o do teste grátis); null se a vitrine não o tiver. */
export function planoDaLanding(planos: PlanoVitrine[], codigo: string): PlanoVitrine | null {
  return planos.find((p) => p.codigo === codigo) ?? null;
}

/** "R$ 247" quando o valor é redondo; com centavos só se houver ("R$ 247,50"). */
export function precoCurto(centavos: Centavos): string {
  return formatBRL(centavos).replace(/,00$/, '');
}
