import { compararDatas, type DataCivil } from '../dates';

/*
 * Sinal pendente (análise de 17/11/2026, §99). Confirmar uma reserva sem sinal é permitido de
 * propósito (o campo é opcional na Agenda: há buffet que confirma pelo contrato e recebe depois),
 * mas o dono precisa ver o que está sem garantia. Pendente = reserva confirmada e ativa, festa de
 * hoje em diante, sinal vazio ou zero, nada recebido no Financeiro e sem plano de pagamento (com
 * plano, quem acompanha é o Financeiro, parcela por parcela).
 * ESPELHO de public._sinal_pendente, com teste de equivalência: mudou uma, mude a outra.
 */

export type EntradaSinal = {
  tipo: 'pre_reserva' | 'confirmada';
  status: 'ativa' | 'vencida' | 'cancelada' | 'realizada';
  sinalCentavos: number | null;
  /** recebimentos não estornados da reserva (Financeiro) */
  recebidoCentavos: number;
  temPlano: boolean;
  data: DataCivil;
  hoje: DataCivil;
};

export function sinalPendente(e: EntradaSinal): boolean {
  return (
    e.tipo === 'confirmada' &&
    e.status === 'ativa' &&
    compararDatas(e.data, e.hoje) >= 0 &&
    !(e.sinalCentavos !== null && e.sinalCentavos > 0) &&
    e.recebidoCentavos <= 0 &&
    !e.temPlano
  );
}
