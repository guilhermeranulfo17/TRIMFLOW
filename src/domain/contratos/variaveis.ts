/*
 * Variáveis do modelo de contrato: {{cliente_nome}}, {{valor_total}}… e blocos opcionais
 * {{#uso_imagem}} … {{/uso_imagem}} que o dono liga ou desliga. Variável sem valor nunca sai
 * vazia: o preenchimento devolve a lista do que falta e o envio fica bloqueado até completar.
 */

export type GrupoVariavel = 'cliente' | 'buffet' | 'festa' | 'valores' | 'regras' | 'contrato';

type DefVariavel = { rotulo: string; grupo: GrupoVariavel; ajuda?: string };

export const VARIAVEIS = {
  cliente_nome: { rotulo: 'Nome do cliente', grupo: 'cliente' },
  cliente_cpf: {
    rotulo: 'CPF do cliente',
    grupo: 'cliente',
    ajuda: 'O cliente informa na hora de assinar. Aparece no comprovante.',
  },
  cliente_whatsapp: { rotulo: 'WhatsApp do cliente', grupo: 'cliente' },
  cliente_email: { rotulo: 'E-mail do cliente', grupo: 'cliente' },
  buffet_nome: { rotulo: 'Nome do buffet', grupo: 'buffet' },
  buffet_razao_social: { rotulo: 'Razão social do buffet', grupo: 'buffet' },
  buffet_cnpj: { rotulo: 'CNPJ do buffet', grupo: 'buffet' },
  buffet_endereco: { rotulo: 'Endereço do buffet', grupo: 'buffet' },
  buffet_cidade: { rotulo: 'Cidade do buffet (foro)', grupo: 'buffet' },
  buffet_whatsapp: { rotulo: 'WhatsApp do buffet', grupo: 'buffet' },
  tipo_evento: { rotulo: 'Tipo de festa', grupo: 'festa' },
  data_evento: { rotulo: 'Data da festa', grupo: 'festa' },
  horario: { rotulo: 'Horário', grupo: 'festa' },
  duracao: { rotulo: 'Duração', grupo: 'festa' },
  espaco: { rotulo: 'Espaço', grupo: 'festa' },
  convidados: { rotulo: 'Convidados', grupo: 'festa' },
  pacote: { rotulo: 'Pacote', grupo: 'festa' },
  itens: { rotulo: 'O que está incluso', grupo: 'festa' },
  nao_incluso: { rotulo: 'O que não está incluso', grupo: 'festa' },
  valor_total: { rotulo: 'Valor total', grupo: 'valores' },
  sinal: { rotulo: 'Sinal', grupo: 'valores' },
  saldo: { rotulo: 'Saldo', grupo: 'valores' },
  forma_pagamento: { rotulo: 'Forma de pagamento', grupo: 'valores' },
  prazo_saldo: { rotulo: 'Prazo do saldo', grupo: 'valores' },
  hora_extra: { rotulo: 'Valor da hora extra', grupo: 'regras' },
  convidados_extras: { rotulo: 'Regra de convidados a mais', grupo: 'regras' },
  regras_cancelamento: { rotulo: 'Multas de cancelamento', grupo: 'regras' },
  prazo_remarcacao: { rotulo: 'Prazo para remarcar', grupo: 'regras' },
  prazo_cancelamento: { rotulo: 'Menor prazo de cancelamento', grupo: 'regras' },
  data_contrato: { rotulo: 'Data do contrato', grupo: 'contrato' },
} as const satisfies Record<string, DefVariavel>;

export type NomeVariavel = keyof typeof VARIAVEIS;
export const NOMES_VARIAVEIS = Object.keys(VARIAVEIS) as NomeVariavel[];

export const BLOCOS = {
  uso_imagem: 'Autorização de uso de imagem',
} as const;
export type NomeBloco = keyof typeof BLOCOS;

export type ValoresContrato = Partial<Record<NomeVariavel, string>>;
export type BlocosContrato = Partial<Record<NomeBloco, boolean>>;

/** Texto final no lugar do CPF: ele só chega na assinatura e vai mascarado no comprovante. */
export const CPF_NA_ASSINATURA = 'informado na assinatura eletrônica (ver comprovante)';

export const TAMANHO_MAXIMO_MODELO = 60_000;

const ehVariavel = (n: string): n is NomeVariavel => Object.hasOwn(VARIAVEIS, n);
const ehBloco = (n: string): n is NomeBloco => Object.hasOwn(BLOCOS, n);

const MARCA = /\{\{\s*([#/]?)\s*([^{}]*?)\s*\}\}/g;

export type ResultadoAnalise = {
  ok: boolean;
  erros: string[];
  variaveis: NomeVariavel[];
  blocos: NomeBloco[];
};

/**
 * Confere um modelo antes de salvar: variáveis e blocos conhecidos, blocos abertos e fechados na
 * ordem, sem blocos dentro de blocos, sem chaves soltas. Mensagens para o dono, em português.
 */
export function analisarModelo(texto: string): ResultadoAnalise {
  const erros: string[] = [];
  const variaveis = new Set<NomeVariavel>();
  const blocos = new Set<NomeBloco>();
  if (!texto.trim()) erros.push('O modelo está vazio.');
  if (texto.length > TAMANHO_MAXIMO_MODELO) {
    erros.push(`O modelo passou de ${TAMANHO_MAXIMO_MODELO.toLocaleString('pt-BR')} caracteres.`);
  }

  let aberto: NomeBloco | null = null;
  for (const m of texto.matchAll(MARCA)) {
    const [bruto, sinal, nome = ''] = m;
    if (sinal === '#') {
      if (!ehBloco(nome)) erros.push(`Bloco desconhecido: ${bruto}.`);
      else if (aberto) erros.push(`O bloco ${bruto} começa dentro de outro bloco.`);
      else {
        aberto = nome;
        blocos.add(nome);
      }
    } else if (sinal === '/') {
      if (!ehBloco(nome)) erros.push(`Fim de bloco desconhecido: ${bruto}.`);
      else if (aberto !== nome) erros.push(`O fim ${bruto} não tem começo.`);
      else aberto = null;
    } else if (!ehVariavel(nome)) {
      erros.push(`Variável desconhecida: ${bruto}. Confira a lista de variáveis.`);
    } else {
      variaveis.add(nome);
    }
  }
  if (aberto) erros.push(`O bloco {{#${aberto}}} não foi fechado com {{/${aberto}}}.`);

  // chaves que sobraram depois de tirar as marcas válidas: "{{cliente_nome}" ou "{cliente}}"
  const resto = texto.replace(MARCA, '');
  if (/\{\{|\}\}/.test(resto)) erros.push('Há chaves {{ }} incompletas no texto.');

  return { ok: erros.length === 0, erros, variaveis: [...variaveis], blocos: [...blocos] };
}

/** Marca da variável que falta no texto da prévia (a tela destaca). */
export const marcaFalta = (n: NomeVariavel) => `[[FALTA:${n}]]`;
export const REGEX_FALTA = /\[\[FALTA:([a-z_]+)\]\]/g;

export type Preenchido = { texto: string; faltando: NomeVariavel[] };

/**
 * Troca as variáveis pelos valores e aplica os blocos. Valor vazio (ou só espaços) conta como
 * faltando: no texto entra a marca [[FALTA:nome]] para a prévia destacar. Modelo inválido lança
 * erro (é validado ao salvar).
 */
export function preencherModelo(
  modelo: string,
  valores: ValoresContrato,
  blocos: BlocosContrato = {},
): Preenchido {
  const analise = analisarModelo(modelo);
  if (!analise.ok) throw new Error(`Modelo de contrato inválido: ${analise.erros[0]}`);

  // 1. blocos: mantém o conteúdo do bloco ligado, tira o desligado (com a linha das marcas)
  const semBlocos = modelo.replace(
    /\{\{\s*#\s*([a-z_]+)\s*\}\}\n?([\s\S]*?)\{\{\s*\/\s*\1\s*\}\}\n?/g,
    (_, nome: NomeBloco, conteudo: string) => (blocos[nome] ? conteudo : ''),
  );

  // 2. variáveis
  const faltando = new Set<NomeVariavel>();
  const texto = semBlocos.replace(MARCA, (_bruto, _sinal, nome: string) => {
    const n = nome as NomeVariavel;
    const v = valores[n]?.trim();
    if (!v) {
      faltando.add(n);
      return marcaFalta(n);
    }
    return v;
  });
  return { texto, faltando: [...faltando] };
}
