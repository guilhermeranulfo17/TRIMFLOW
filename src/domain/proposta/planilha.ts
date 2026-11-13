import { arquivoCsv } from '../lgpd/csv';
import type { ModeloProposta } from './conteudo';

/*
 * Proposta em planilha (Fase 5): CSV com ";" e UTF-8 com BOM (o mesmo gerador das exportações),
 * para o Excel em português abrir certo. Uma linha por item do investimento (tipo, descrição,
 * detalhe, valor), depois total, valor por convidado e condições de pagamento. Desenha o MESMO
 * ModeloProposta da web e do PDF: nunca observação interna, motivo do desconto nem autor.
 */

const TIPO: Record<string, string> = {
  pacote: 'Pacote',
  opcional: 'Opcional',
  ajuste_dia: 'Ajuste do dia',
  hora_extra: 'Hora extra',
  deslocamento: 'Deslocamento',
  avulso: 'Item avulso',
  desconto: 'Desconto',
};

export function rotuloTipoItem(tipo: string): string {
  return TIPO[tipo] ?? 'Item';
}

/**
 * "R$ 1.234,56" e, no desconto, "R$ -297,50". Célula que começa com "-" ganharia um apóstrofo
 * da proteção contra fórmula (vira texto); com o sinal depois do "R$" ela fica legível e segura.
 */
function valor(texto: string): string {
  return texto.replace(/^-\s*R\$\s*/, 'R$ -');
}

type Linha = { Tipo: string; Descrição: string; Detalhe: string; Valor: string };

export function planilhaDaProposta(m: ModeloProposta): string {
  const linhas: Linha[] = m.investimento.linhas.map((l) => ({
    Tipo: rotuloTipoItem(l.tipo),
    Descrição: l.descricao,
    Detalhe: l.detalhe ?? '',
    Valor: valor(l.valor),
  }));
  const extra = (tipo: string, descricao = '', v = '') =>
    linhas.push({ Tipo: tipo, Descrição: descricao, Detalhe: '', Valor: v });

  extra('');
  extra('Total', '', m.investimento.total);
  if (m.investimento.porConvidado) extra('Valor por convidado', '', m.investimento.porConvidado);
  extra('');
  if (m.condicoes.sinal) extra('Condições', `Sinal de ${m.condicoes.sinal}`);
  for (const p of m.condicoes.parcelas) extra('Condições', p);
  if (m.condicoes.formasPagamento)
    extra('Condições', `Formas de pagamento: ${m.condicoes.formasPagamento}`);
  if (m.condicoes.ultimaParcela) extra('Condições', m.condicoes.ultimaParcela);
  if (m.condicoes.texto) extra('Condições', m.condicoes.texto);

  return arquivoCsv(linhas, ['Tipo', 'Descrição', 'Detalhe', 'Valor']);
}
