import { formatInTimeZone } from 'date-fns-tz';
import { dataPorExtenso, formatData } from '../dates';
import { arquivoCsv } from '../lgpd/csv';

/*
 * Ficha da cozinha (Fase 4): o que a equipe precisa para produzir a festa de uma reserva
 * confirmada, SEM preço nenhum. Quantidades só onde o catálogo tem quantidade de verdade
 * (pacote e opcional cobrados por pessoa = total de convidados; por unidade ou por hora = a
 * quantidade escolhida); sem quantidade, só o item. Nunca inventamos consumo médio.
 */

export type CobrancaOpcional = 'por_pessoa' | 'fixo' | 'por_unidade' | 'por_hora';

export type DadosFicha = {
  buffet: string;
  cliente: string;
  tipoEvento: string | null;
  /** data civil yyyy-MM-dd */
  data: string;
  /** início do evento (instante ISO) */
  inicio: string;
  /** duração da festa em minutos (pacote + horas extras, ou a do turno) */
  duracaoMin: number;
  fuso: string;
  turno: string | null;
  espaco: { nome: string; noLocalDoCliente: boolean; localCliente: string | null } | null;
  /** convidados por faixa (conteúdo congelado) ou só o total (versões antigas) */
  convidados: { rotulo: string; quantidade: number }[];
  pacote: { nome: string; porPessoa: boolean } | null;
  cardapio: { nome: string; itens: string[] }[];
  opcionais: { nome: string; cobranca: CobrancaOpcional | null; quantidade: number }[];
  /** itens que o cliente tirou do pacote (Fase 6) */
  retirados?: string[];
  observacoes: string[];
};

export type LinhaFicha = { item: string; quantidade: string | null };

export type FichaCozinha = {
  titulo: string;
  buffet: string;
  evento: { rotulo: string; valor: string }[];
  convidados: { rotulo: string; quantidade: number }[];
  totalConvidados: number;
  pacote: LinhaFicha | null;
  cardapio: { secao: string; itens: string[] }[];
  opcionais: LinhaFicha[];
  retirados: string[];
  observacoes: string[];
};

function convidadosTexto(n: number): string {
  return n === 1 ? '1 convidado' : `${n} convidados`;
}

/** Quantidade para a cozinha: só quando o item tem quantidade de verdade. */
export function quantidadeDoOpcional(
  o: { cobranca: CobrancaOpcional | null; quantidade: number },
  totalConvidados: number,
): string | null {
  switch (o.cobranca) {
    case 'por_pessoa':
      return totalConvidados > 0 ? `para ${convidadosTexto(totalConvidados)}` : null;
    case 'por_unidade':
      return o.quantidade > 0
        ? o.quantidade === 1
          ? '1 unidade'
          : `${o.quantidade} unidades`
        : null;
    case 'por_hora':
      return o.quantidade > 0 ? (o.quantidade === 1 ? '1 hora' : `${o.quantidade} horas`) : null;
    default:
      return null;
  }
}

function hora(instante: Date, fuso: string): string {
  return formatInTimeZone(instante, fuso, 'HH:mm');
}

export function montarFicha(d: DadosFicha): FichaCozinha {
  const totalConvidados = d.convidados.reduce((n, c) => n + c.quantidade, 0);
  const inicio = new Date(d.inicio);
  const fim = new Date(inicio.getTime() + Math.max(0, d.duracaoMin) * 60_000);
  const local = d.espaco
    ? d.espaco.noLocalDoCliente
      ? `No local do cliente${d.espaco.localCliente ? `: ${d.espaco.localCliente}` : ''}`
      : d.espaco.nome
    : null;
  const evento = [
    { rotulo: 'Cliente', valor: d.cliente },
    { rotulo: 'Tipo de evento', valor: d.tipoEvento },
    { rotulo: 'Data', valor: `${dataPorExtenso(d.data)} (${formatData(d.data)})` },
    {
      rotulo: 'Horário',
      valor: `${hora(inicio, d.fuso)} às ${hora(fim, d.fuso)}${d.turno ? ` (${d.turno})` : ''}`,
    },
    { rotulo: 'Local', valor: local },
  ].filter((l): l is { rotulo: string; valor: string } => !!l.valor);

  return {
    titulo: `Ficha da cozinha · ${d.cliente} · ${formatData(d.data)}`,
    buffet: d.buffet,
    evento,
    convidados: d.convidados.filter((c) => c.quantidade > 0),
    totalConvidados,
    pacote: d.pacote
      ? {
          item: d.pacote.nome,
          quantidade:
            d.pacote.porPessoa && totalConvidados > 0
              ? `para ${convidadosTexto(totalConvidados)}`
              : null,
        }
      : null,
    cardapio: d.cardapio
      .filter((s) => s.itens.length > 0)
      .map((s) => ({ secao: s.nome, itens: s.itens })),
    opcionais: d.opcionais.map((o) => ({
      item: o.nome,
      quantidade: quantidadeDoOpcional(o, totalConvidados),
    })),
    retirados: d.retirados ?? [],
    observacoes: d.observacoes.map((o) => o.trim()).filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// CSV (planilha): mesmo gerador das exportações (";" e UTF-8 com BOM, sem fórmula)
// ---------------------------------------------------------------------------

/** Planilha da ficha: uma linha por informação, com a seção na primeira coluna. */
export function fichaEmCsv(f: FichaCozinha): string {
  const linhas: { Seção: string; Item: string; Quantidade: string | number | null }[] = [];
  const add = (secao: string, item: string, quantidade: string | number | null = null) =>
    linhas.push({ Seção: secao, Item: item, Quantidade: quantidade });
  for (const e of f.evento) add('Evento', `${e.rotulo}: ${e.valor}`);
  for (const c of f.convidados) add('Convidados', c.rotulo, c.quantidade);
  add('Convidados', 'Total', f.totalConvidados);
  if (f.pacote) add('Pacote', f.pacote.item, f.pacote.quantidade);
  for (const s of f.cardapio) for (const i of s.itens) add(`Cardápio: ${s.secao}`, i);
  for (const o of f.opcionais) add('Opcional', o.item, o.quantidade);
  for (const r of f.retirados) add('Retirado do pacote', r);
  for (const o of f.observacoes) add('Observações', o);
  return arquivoCsv(linhas, ['Seção', 'Item', 'Quantidade']);
}

/** Nome do arquivo (sem caracteres proibidos): "Ficha da cozinha - Ana Souza - 2027-05-15.pdf". */
export function arquivoFicha(cliente: string, data: string, extensao: 'pdf' | 'csv') {
  const limpo = (t: string) =>
    t
      .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const nome = `Ficha da cozinha - ${limpo(cliente).slice(0, 80)} - ${data}.${extensao}`;
  const simples = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/"/g, '');
  return {
    nome,
    contentDisposition: `attachment; filename="${simples}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
  };
}
