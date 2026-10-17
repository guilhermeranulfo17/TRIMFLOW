import { leadVendasSchema, normalizarBusca, type LeadVendasDados } from './lead';

/*
 * Importação de leads de vendas por CSV (Etapa 14, passo 4). Função pura: o navegador usa para
 * a prévia e o servidor roda de novo na hora de gravar (nunca confia nas linhas do navegador).
 * Aceita ";" (Excel em português) ou ",", aspas, quebra de linha dentro de aspas e BOM.
 * Cabeçalho obrigatório; colunas reconhecidas pelo nome, em qualquer ordem.
 */

export const LIMITE_LINHAS_CSV = 2000;
export const LIMITE_BYTES_CSV = 500_000;

type Coluna = 'nome' | 'buffet' | 'telefone' | 'cidade' | 'origem' | 'resumo';

/** Nomes aceitos no cabeçalho (sem acento, minúsculos). */
const SINONIMOS: Record<Coluna, string[]> = {
  nome: ['nome', 'contato', 'responsavel', 'dono', 'name'],
  buffet: ['buffet', 'empresa', 'nome do buffet', 'estabelecimento'],
  telefone: ['telefone', 'whatsapp', 'celular', 'fone', 'tel', 'phone'],
  cidade: ['cidade', 'municipio', 'city'],
  origem: ['origem', 'fonte', 'canal'],
  resumo: ['resumo', 'observacao', 'observacoes', 'obs', 'notas'],
};

export type LinhaImportacao =
  | { linha: number; situacao: 'ok'; dados: LeadVendasDados }
  | { linha: number; situacao: 'invalida'; nome: string; erro: string }
  | { linha: number; situacao: 'repetida'; dados: LeadVendasDados };

export type LeituraCsv =
  { ok: true; colunas: Coluna[]; linhas: LinhaImportacao[] } | { ok: false; erro: string };

/** Separa o texto em linhas e campos (RFC 4180, com o separador detectado no cabeçalho). */
export function separarCsv(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, '');
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i]!;
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpo[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((v) => v.trim() !== ''));
}

function colunaDoCabecalho(titulo: string): Coluna | null {
  const t = normalizarBusca(titulo);
  for (const [coluna, nomes] of Object.entries(SINONIMOS) as [Coluna, string[]][]) {
    if (nomes.includes(t)) return coluna;
  }
  return null;
}

/**
 * Lê o CSV e valida cada linha com o mesmo schema do cadastro à mão. Telefone repetido dentro
 * do arquivo: a primeira ocorrência vale, as outras ficam como "repetida".
 */
export function lerCsvLeads(texto: string): LeituraCsv {
  if (texto.length > LIMITE_BYTES_CSV) {
    return { ok: false, erro: 'Arquivo grande demais. Divida em planilhas de até 2.000 linhas.' };
  }
  const [cabecalho, ...dados] = separarCsv(texto);
  if (!cabecalho) return { ok: false, erro: 'O arquivo está vazio.' };
  const mapa = cabecalho.map(colunaDoCabecalho);
  if (!mapa.includes('nome')) {
    return {
      ok: false,
      erro: 'Não achei a coluna "nome" no cabeçalho. A primeira linha precisa ter os nomes das colunas.',
    };
  }
  if (dados.length > LIMITE_LINHAS_CSV) {
    return { ok: false, erro: 'Planilha com mais de 2.000 linhas. Divida em partes.' };
  }
  const vistos = new Set<string>();
  const linhas = dados.map((valores, i): LinhaImportacao => {
    const bruto: Record<Coluna, string> = {
      nome: '',
      buffet: '',
      telefone: '',
      cidade: '',
      origem: '',
      resumo: '',
    };
    mapa.forEach((coluna, j) => {
      if (coluna && !bruto[coluna]) bruto[coluna] = (valores[j] ?? '').trim();
    });
    const numero = i + 2; // a linha 1 é o cabeçalho
    const r = leadVendasSchema.safeParse({ ...bruto, proximoFollowup: '', naoContatar: false });
    if (!r.success) {
      return {
        linha: numero,
        situacao: 'invalida',
        nome: bruto.nome,
        erro: r.error.issues[0]?.message ?? 'Linha inválida.',
      };
    }
    const tel = r.data.telefone;
    if (tel && vistos.has(tel)) return { linha: numero, situacao: 'repetida', dados: r.data };
    if (tel) vistos.add(tel);
    return { linha: numero, situacao: 'ok', dados: r.data };
  });
  return { ok: true, colunas: mapa.filter((c): c is Coluna => c !== null), linhas };
}
