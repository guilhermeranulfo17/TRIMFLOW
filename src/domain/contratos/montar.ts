import { dataPorExtenso, type DataCivil } from '../dates';
import { formatPhoneBR } from '../phone';
import { formatarDocumento } from '../cobranca/documento';
import { valorComExtenso } from './extenso';
import { menorPrazoCancelamento, textoCancelamento, type OpcoesContrato } from './opcoes';
import { CPF_NA_ASSINATURA, type BlocosContrato, type ValoresContrato } from './variaveis';
import { formatBRL } from '../money';

/*
 * De onde vêm os valores do contrato: lead, buffet, orçamento (versão vigente, congelada) e as
 * regras do buffet. Tudo aqui é só formatação; quem lê o banco é o servidor. O que vier vazio
 * vira "faltando" no preenchimento e o dono completa na prévia.
 */

export type FonteContrato = {
  hoje: DataCivil;
  cliente: { nome: string | null; whatsappE164: string | null; email: string | null };
  buffet: {
    nome: string;
    razaoSocial: string | null;
    cnpj: string | null;
    endereco: string | null;
    cidade: string | null;
    uf: string | null;
    whatsappE164: string | null;
  };
  festa: {
    tipoEvento: string | null;
    data: DataCivil | null;
    horaInicio: string | null;
    duracaoMin: number | null;
    espaco: string | null;
    convidados: number | null;
    pacote: string | null;
    itens: string[];
    naoIncluso: string | null;
  };
  valores: { totalCentavos: number; sinalCentavos: number; saldoCentavos: number } | null;
  formasPagamento: string[];
  prazoSaldoDias: number | null;
  horaExtraCentavos: number | null;
  alteracaoConvidados: string | null;
  opcoes: OpcoesContrato;
};

/** "15:00" + 300 min → "das 15:00 às 20:00" (passa da meia-noite: "às 01:00 do dia seguinte"). */
export function horarioDaFesta(horaInicio: string, duracaoMin: number): string {
  const m = /^(\d{2}):(\d{2})/.exec(horaInicio);
  if (!m) return horaInicio;
  const inicio = Number(m[1]) * 60 + Number(m[2]);
  const fim = inicio + duracaoMin;
  const hhmm = (min: number) =>
    `${String(Math.trunc((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  return `das ${hhmm(inicio)} às ${hhmm(fim)}${fim >= 1440 ? ' do dia seguinte' : ''}`;
}

/** 300 → "5 horas"; 270 → "4 horas e 30 minutos"; 45 → "45 minutos". */
export function duracaoPorExtenso(min: number): string {
  const h = Math.trunc(min / 60);
  const r = min % 60;
  const horas = h ? `${h} ${h === 1 ? 'hora' : 'horas'}` : '';
  const minutos = r ? `${r} minutos` : '';
  return [horas, minutos].filter(Boolean).join(' e ') || '0 minutos';
}

const texto = (v: string | null | undefined) => (v && v.trim() ? v.trim() : undefined);

/** "Pix, Cartão de crédito e Boleto" */
function juntar(lista: string[]): string | undefined {
  const l = lista.map((s) => s.trim()).filter(Boolean);
  if (l.length === 0) return undefined;
  if (l.length === 1) return l[0];
  return `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;
}

export function valoresDoContrato(f: FonteContrato): ValoresContrato {
  const b = f.buffet;
  const cidade = b.cidade ? (b.uf ? `${b.cidade.trim()}/${b.uf}` : b.cidade.trim()) : undefined;
  const v: ValoresContrato = {
    cliente_nome: texto(f.cliente.nome),
    cliente_cpf: CPF_NA_ASSINATURA,
    cliente_whatsapp: f.cliente.whatsappE164 ? formatPhoneBR(f.cliente.whatsappE164) : undefined,
    cliente_email: texto(f.cliente.email),
    buffet_nome: texto(b.nome),
    buffet_razao_social: texto(b.razaoSocial),
    buffet_cnpj: b.cnpj ? formatarDocumento(b.cnpj) : undefined,
    buffet_endereco: texto(b.endereco),
    buffet_cidade: cidade,
    buffet_whatsapp: b.whatsappE164 ? formatPhoneBR(b.whatsappE164) : undefined,
    tipo_evento: texto(f.festa.tipoEvento),
    data_evento: f.festa.data ? dataPorExtenso(f.festa.data) : undefined,
    horario:
      f.festa.horaInicio && f.festa.duracaoMin
        ? horarioDaFesta(f.festa.horaInicio, f.festa.duracaoMin)
        : undefined,
    duracao: f.festa.duracaoMin ? duracaoPorExtenso(f.festa.duracaoMin) : undefined,
    espaco: texto(f.festa.espaco),
    convidados:
      f.festa.convidados && f.festa.convidados > 0
        ? `${f.festa.convidados} ${f.festa.convidados === 1 ? 'convidado' : 'convidados'}`
        : undefined,
    pacote: texto(f.festa.pacote),
    itens: f.festa.itens.length ? f.festa.itens.map((i) => `- ${i.trim()}`).join('\n') : undefined,
    nao_incluso: texto(f.festa.naoIncluso),
    valor_total: f.valores ? valorComExtenso(f.valores.totalCentavos) : undefined,
    sinal: f.valores ? valorComExtenso(f.valores.sinalCentavos) : undefined,
    saldo: f.valores ? valorComExtenso(f.valores.saldoCentavos) : undefined,
    forma_pagamento: juntar(f.formasPagamento),
    prazo_saldo:
      f.prazoSaldoDias === null
        ? undefined
        : f.prazoSaldoDias === 0
          ? 'até o dia da festa'
          : `até ${f.prazoSaldoDias} ${f.prazoSaldoDias === 1 ? 'dia' : 'dias'} antes da festa`,
    hora_extra:
      f.horaExtraCentavos && f.horaExtraCentavos > 0 ? formatBRL(f.horaExtraCentavos) : undefined,
    convidados_extras: texto(f.alteracaoConvidados),
    regras_cancelamento: textoCancelamento(f.opcoes.cancelamento),
    prazo_remarcacao: `${f.opcoes.remarcacaoDias} ${f.opcoes.remarcacaoDias === 1 ? 'dia' : 'dias'}`,
    prazo_cancelamento: `${menorPrazoCancelamento(f.opcoes.cancelamento)} dias`,
    data_contrato: dataPorExtenso(f.hoje).replace(/^[^,]+, /, ''),
  };
  return Object.fromEntries(
    Object.entries(v).filter(([, x]) => x !== undefined),
  ) as ValoresContrato;
}

export function blocosDoContrato(o: OpcoesContrato): BlocosContrato {
  return { uso_imagem: o.usoImagem };
}

/**
 * Resumo guardado em contratos.valores (congelado com o texto): o topo da página do cliente,
 * a lista do painel e a data da festa para a guarda (LGPD: 5 anos depois da festa).
 */
export type ResumoContrato = {
  data: DataCivil | null;
  horario: string | null;
  convidados: number | null;
  espaco: string | null;
  pacote: string | null;
  tipoEvento: string | null;
  totalCentavos: number | null;
  sinalCentavos: number | null;
  saldoCentavos: number | null;
};

export function resumoDoContrato(f: FonteContrato): ResumoContrato {
  return {
    data: f.festa.data,
    horario:
      f.festa.horaInicio && f.festa.duracaoMin
        ? horarioDaFesta(f.festa.horaInicio, f.festa.duracaoMin)
        : null,
    convidados: f.festa.convidados,
    espaco: f.festa.espaco,
    pacote: f.festa.pacote,
    tipoEvento: f.festa.tipoEvento,
    totalCentavos: f.valores?.totalCentavos ?? null,
    sinalCentavos: f.valores?.sinalCentavos ?? null,
    saldoCentavos: f.valores?.saldoCentavos ?? null,
  };
}

/** Lê o resumo guardado (jsonb) sem confiar no formato. */
export function lerResumo(bruto: unknown): ResumoContrato {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const texto = (k: string) => (typeof o[k] === 'string' && o[k] ? (o[k] as string) : null);
  const inteiro = (k: string) => (Number.isSafeInteger(o[k]) ? (o[k] as number) : null);
  return {
    data: texto('data'),
    horario: texto('horario'),
    convidados: inteiro('convidados'),
    espaco: texto('espaco'),
    pacote: texto('pacote'),
    tipoEvento: texto('tipoEvento'),
    totalCentavos: inteiro('totalCentavos'),
    sinalCentavos: inteiro('sinalCentavos'),
    saldoCentavos: inteiro('saldoCentavos'),
  };
}
