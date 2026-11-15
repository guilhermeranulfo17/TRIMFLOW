import { formatBRL } from '../money';
import { descreverEquivalentes } from './pacote';
import type { LinhaOrcamento, OpcionalCtx } from './tipos';

export { contarConvidados } from './equivalentes';

/** Preço por pessoa do item para N convidados: a menor faixa que cobre; senão, o preço base. */
export function precoPorPessoaDoItem(opcional: OpcionalCtx, equivalentes: number): number {
  const faixas = [...(opcional.faixasPorPessoa ?? [])].sort(
    (a, b) => a.ateConvidados - b.ateConvidados,
  );
  return (
    faixas.find((f) => f.ateConvidados >= equivalentes)?.valorCentavos ?? opcional.precoCentavos
  );
}

/** Item por unidade com quantidade calculada pelos convidados (arredonda para cima). */
export const quantidadePorConvidado = (
  opcional: OpcionalCtx,
  equivalentes: number,
): number | null =>
  opcional.cobranca === 'por_unidade' && opcional.qtdPorConvidadoCent
    ? Math.ceil((equivalentes * opcional.qtdPorConvidadoCent) / 100)
    : null;

const unidades = (n: number) => `${n} ${n === 1 ? 'unidade' : 'unidades'}`;
const porConvidado = (cent: number) =>
  `${(cent / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} por convidado`;

/** Linha de um opcional conforme a cobrança: por pessoa, fixo, por unidade ou por hora. */
export function descreverOpcional(
  opcional: OpcionalCtx,
  quantidadeInformada: number,
  equivalentes: number,
): LinhaOrcamento {
  const preco = opcional.precoCentavos;
  const base = { tipo: 'opcional' as const, referenciaId: opcional.id, descricao: opcional.nome };
  switch (opcional.cobranca) {
    case 'por_pessoa': {
      const porPessoa = precoPorPessoaDoItem(opcional, equivalentes);
      return {
        ...base,
        quantidade: equivalentes,
        valorUnitarioCentavos: porPessoa,
        subtotalCentavos: equivalentes * porPessoa,
        detalhe: `${descreverEquivalentes(equivalentes)} × ${formatBRL(porPessoa)}`,
      };
    }
    case 'fixo':
      return {
        ...base,
        quantidade: 1,
        valorUnitarioCentavos: preco,
        subtotalCentavos: preco,
        detalhe: 'Valor fixo',
      };
    case 'por_unidade': {
      const calculada = quantidadePorConvidado(opcional, equivalentes);
      if (calculada !== null) {
        return {
          ...base,
          quantidade: calculada,
          valorUnitarioCentavos: preco,
          subtotalCentavos: calculada * preco,
          detalhe: `${unidades(calculada)} (${porConvidado(opcional.qtdPorConvidadoCent!)}) × ${formatBRL(preco)}`,
          ocultarConta: true,
        };
      }
      return {
        ...base,
        quantidade: quantidadeInformada,
        valorUnitarioCentavos: preco,
        subtotalCentavos: quantidadeInformada * preco,
        detalhe: `${quantidadeInformada} × ${formatBRL(preco)}`,
      };
    }
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
