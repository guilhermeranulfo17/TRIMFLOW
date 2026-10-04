/*
 * CSV das exportações da LGPD (Etapa 9B, B.1). Separador ";" e BOM UTF-8: o Excel em português
 * abre com acentos e colunas certas. Objetos e listas saem como JSON na célula.
 */

export type Linha = Record<string, unknown>;

const BOM = '﻿';

function celula(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  let texto: string;
  if (valor instanceof Date) texto = valor.toISOString();
  else if (typeof valor === 'object') texto = JSON.stringify(valor);
  else texto = String(valor);
  // Texto que o Excel leria como fórmula (=, +, -, @) ganha um apóstrofo: injeção de CSV
  if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Colunas: as da primeira linha, depois as que aparecerem nas outras, na ordem. */
export function colunasDe(linhas: Linha[]): string[] {
  const vistas = new Set<string>();
  for (const l of linhas) for (const c of Object.keys(l)) vistas.add(c);
  return [...vistas];
}

/** Uma tabela em CSV (sem BOM; use `arquivoCsv` para o arquivo final). */
export function tabelaCsv(linhas: Linha[], colunas = colunasDe(linhas)): string {
  const cabecalho = colunas.map(celula).join(';');
  const corpo = linhas.map((l) => colunas.map((c) => celula(l[c])).join(';'));
  return [cabecalho, ...corpo].join('\r\n');
}

export function arquivoCsv(linhas: Linha[], colunas?: string[]): string {
  return BOM + tabelaCsv(linhas, colunas) + '\r\n';
}

/**
 * Exportação de um lead em um CSV só, com uma seção por assunto (título "# Orçamentos", depois a
 * tabela). Seções vazias aparecem com "(nenhum)".
 */
export function csvDoLead(exportacao: Record<string, unknown>): string {
  const SECOES: [string, string][] = [
    ['lead', 'Dados do lead'],
    ['orcamentos', 'Orçamentos'],
    ['reservas', 'Reservas'],
    ['visitas', 'Visitas'],
    ['atividades', 'Atividades'],
    ['notas', 'Notas'],
    ['tarefas', 'Tarefas'],
  ];
  const partes = SECOES.map(([chave, titulo]) => {
    const valor = exportacao[chave];
    const linhas = (Array.isArray(valor) ? valor : valor ? [valor] : []) as Linha[];
    return `# ${titulo}\r\n${linhas.length ? tabelaCsv(linhas) : '(nenhum)'}`;
  });
  return BOM + partes.join('\r\n\r\n') + '\r\n';
}
