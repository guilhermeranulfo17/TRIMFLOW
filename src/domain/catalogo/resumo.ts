import { formatBRL } from '../money';

/** Textos curtos de preço para os cards do catálogo. */

export type ResumoPrecoPacote = {
  modeloPreco: 'por_pessoa' | 'por_faixa';
  precoPessoaCentavos: number | null;
  valorExcedenteCentavos: number | null;
  faixas: { ateConvidados: number; valorCentavos: number }[];
};

export function resumirPrecoPacote(p: ResumoPrecoPacote): string {
  if (p.modeloPreco === 'por_pessoa') {
    return p.precoPessoaCentavos === null
      ? 'Sem preço'
      : `${formatBRL(p.precoPessoaCentavos)} por convidado`;
  }
  const [primeira] = [...p.faixas].sort((a, b) => a.ateConvidados - b.ateConvidados);
  if (!primeira || p.valorExcedenteCentavos === null) return 'Sem preço';
  return `${formatBRL(primeira.valorCentavos)} até ${primeira.ateConvidados} convidados`;
}

export type CobrancaOpcional = 'por_pessoa' | 'fixo' | 'por_unidade' | 'por_hora';

export const ROTULOS_COBRANCA: Record<CobrancaOpcional, string> = {
  por_pessoa: 'Por convidado',
  fixo: 'Valor fixo',
  por_unidade: 'Por unidade',
  por_hora: 'Por hora',
};

export function resumirPrecoOpcional(o: { cobranca: CobrancaOpcional; precoCentavos: number }) {
  const valor = formatBRL(o.precoCentavos);
  switch (o.cobranca) {
    case 'por_pessoa':
      return `${valor} por convidado`;
    case 'por_unidade':
      return `${valor} por unidade`;
    case 'por_hora':
      return `${valor} por hora`;
    case 'fixo':
      return `${valor} (valor fixo)`;
  }
}
