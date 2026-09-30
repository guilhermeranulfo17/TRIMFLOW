import { formatBRL } from '../money';
import { descreverEquivalentes } from './pacote';
import type { LinhaOrcamento, OpcionalCtx } from './tipos';

export { contarConvidados } from './equivalentes';

/** Linha de um opcional conforme a cobrança: por pessoa, fixo, por unidade ou por hora. */
export function descreverOpcional(
  opcional: OpcionalCtx,
  quantidadeInformada: number,
  equivalentes: number,
): LinhaOrcamento {
  const preco = opcional.precoCentavos;
  const base = { tipo: 'opcional' as const, referenciaId: opcional.id, descricao: opcional.nome };
  switch (opcional.cobranca) {
    case 'por_pessoa':
      return {
        ...base,
        quantidade: equivalentes,
        valorUnitarioCentavos: preco,
        subtotalCentavos: equivalentes * preco,
        detalhe: `${descreverEquivalentes(equivalentes)} × ${formatBRL(preco)}`,
      };
    case 'fixo':
      return {
        ...base,
        quantidade: 1,
        valorUnitarioCentavos: preco,
        subtotalCentavos: preco,
        detalhe: 'Valor fixo',
      };
    case 'por_unidade':
      return {
        ...base,
        quantidade: quantidadeInformada,
        valorUnitarioCentavos: preco,
        subtotalCentavos: quantidadeInformada * preco,
        detalhe: `${quantidadeInformada} × ${formatBRL(preco)}`,
      };
    case 'por_hora':
      return {
        ...base,
        quantidade: quantidadeInformada,
        valorUnitarioCentavos: preco,
        subtotalCentavos: quantidadeInformada * preco,
        detalhe: `${quantidadeInformada} h × ${formatBRL(preco)}`,
      };
  }
}
