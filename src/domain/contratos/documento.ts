import { REGEX_FALTA } from './variaveis';

/*
 * Formato do texto do contrato (o mesmo para a web, a prévia e o PDF):
 *   # Título            → título do contrato
 *   ## 1. Cláusula      → título de cláusula
 *   - item              → item de lista
 *   linha em branco     → separa parágrafos
 * Nada de HTML: quem desenha é a página ou o PDF.
 */

export type BlocoTexto =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'clausula'; texto: string }
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'lista'; itens: string[] };

export function blocosDoTexto(texto: string): BlocoTexto[] {
  const blocos: BlocoTexto[] = [];
  let paragrafo: string[] = [];
  let lista: string[] = [];
  const fecharParagrafo = () => {
    if (paragrafo.length) blocos.push({ tipo: 'paragrafo', texto: paragrafo.join(' ') });
    paragrafo = [];
  };
  const fecharLista = () => {
    if (lista.length) blocos.push({ tipo: 'lista', itens: lista });
    lista = [];
  };
  for (const bruta of texto.split('\n')) {
    const linha = bruta.trim();
    if (!linha) {
      fecharParagrafo();
      fecharLista();
    } else if (linha.startsWith('## ')) {
      fecharParagrafo();
      fecharLista();
      blocos.push({ tipo: 'clausula', texto: linha.slice(3).trim() });
    } else if (linha.startsWith('# ')) {
      fecharParagrafo();
      fecharLista();
      blocos.push({ tipo: 'titulo', texto: linha.slice(2).trim() });
    } else if (linha.startsWith('- ')) {
      fecharParagrafo();
      lista.push(linha.slice(2).trim());
    } else {
      fecharLista();
      paragrafo.push(linha);
    }
  }
  fecharParagrafo();
  fecharLista();
  return blocos;
}

export type Trecho = { texto: string; falta?: string };

/** Separa as marcas [[FALTA:x]] para a prévia destacar o que o dono ainda precisa completar. */
export function trechosComFalta(texto: string): Trecho[] {
  const trechos: Trecho[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(REGEX_FALTA)) {
    if (m.index > ultimo) trechos.push({ texto: texto.slice(ultimo, m.index) });
    trechos.push({ texto: m[0], falta: m[1] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) trechos.push({ texto: texto.slice(ultimo) });
  return trechos;
}

/** "2026-0007" */
export function numeroContrato(ano: number, numero: number): string {
  return `${ano}-${String(numero).padStart(4, '0')}`;
}

function semProibidos(t: string): string {
  return t
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Contrato 2026-0007 - Buffet X - Ana Souza.pdf", com filename ASCII e filename* UTF-8. */
export function arquivoContrato(d: { codigo: string; buffet: string; cliente?: string | null }): {
  nome: string;
  contentDisposition: string;
} {
  const partes = [`Contrato ${d.codigo}`, d.buffet, d.cliente]
    .filter((p): p is string => !!p && !!p.trim())
    .map(semProibidos);
  const nome = `${partes.join(' - ').slice(0, 150)}.pdf`;
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
