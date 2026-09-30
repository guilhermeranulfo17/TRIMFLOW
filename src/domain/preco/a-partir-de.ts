import { dataCivilValida } from '../dates';
import { pctBp } from '../money';
import { escolherAjusteDia } from './ajuste-dia';
import { pacotesDisponiveis } from './disponibilidade';
import { contarConvidados } from './equivalentes';
import { valorDoPacote } from './pacote';
import type { ContextoPreco, DataCivil, Id } from './tipos';

export type EntradaParcial = {
  tipoEventoId: Id;
  data?: DataCivil;
  turnoId?: Id;
  adultos?: number;
  criancas?: { faixaIdadeId: Id; quantidade: number }[];
};

export type APartirDe = { totalCentavos: number; pacoteId: Id; convidadosEquivalentes: number };

/**
 * Menor total possível com o que o cliente já escolheu (tipo, data, turno, convidados),
 * sem opcionais, horas extras nem deslocamento. Usado no modo de exibição "faixa".
 * Sem convidados informados, considera o mínimo de cada pacote. Null se nenhum pacote serve.
 */
export function aPartirDe(contexto: ContextoPreco, entrada: EntradaParcial): APartirDe | null {
  const informouConvidados = entrada.adultos !== undefined;
  let melhor: APartirDe | null = null;

  for (const { pacote } of pacotesDisponiveis(contexto, { tipoEventoId: entrada.tipoEventoId })) {
    let eq = pacote.minConvidados;
    if (informouConvidados) {
      eq = contarConvidados(
        contexto,
        pacote.id,
        entrada.adultos ?? 0,
        entrada.criancas ?? [],
      ).equivalentes;
      if (
        eq < pacote.minConvidados ||
        (pacote.maxConvidados !== null && eq > pacote.maxConvidados)
      ) {
        continue;
      }
    }
    const valor = valorDoPacote(pacote, eq);
    if (!valor) continue;

    let total = valor.subtotalCentavos;
    if (entrada.data && dataCivilValida(entrada.data)) {
      const ajuste = escolherAjusteDia(contexto, entrada.data, entrada.turnoId ?? null);
      if (ajuste) total += pctBp(valor.subtotalCentavos, ajuste.ajuste.ajusteBp);
    }
    if (!melhor || total < melhor.totalCentavos) {
      melhor = { totalCentavos: total, pacoteId: pacote.id, convidadosEquivalentes: eq };
    }
  }
  return melhor;
}
