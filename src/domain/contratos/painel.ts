import type { StatusContrato } from './estados';

/*
 * Lista e detalhe do contrato no painel (Etapa 10, PR 2): filtros da URL e a linha do tempo a
 * partir da auditoria (os eventos do link do cliente gravam sem usuário).
 */

export const FILTROS_CONTRATO = [
  'todos',
  'aguardando',
  'assinados',
  'ajuste',
  'vencidos',
  'cancelados',
] as const;
export type FiltroContrato = (typeof FILTROS_CONTRATO)[number];

export const ROTULO_FILTRO_CONTRATO: Record<FiltroContrato, string> = {
  todos: 'Todos',
  aguardando: 'Aguardando',
  assinados: 'Assinados',
  ajuste: 'Pediram ajuste',
  vencidos: 'Link vencido',
  cancelados: 'Cancelados',
};

/** Status (já efetivos: enviado e vencido conta como expirado) de cada filtro. */
export const STATUS_DO_FILTRO: Record<FiltroContrato, StatusContrato[] | null> = {
  todos: null,
  aguardando: ['enviado'],
  assinados: ['concluido', 'assinado_cliente'],
  ajuste: ['recusado'],
  vencidos: ['expirado'],
  cancelados: ['cancelado'],
};

export function filtroContratoDaUrl(v: string | string[] | undefined): FiltroContrato {
  const s = Array.isArray(v) ? v[0] : v;
  return (FILTROS_CONTRATO as readonly string[]).includes(s ?? '')
    ? (s as FiltroContrato)
    : 'todos';
}

/** Em qual filtro o status efetivo cai ("todos" fica de fora). */
export function filtroDoStatus(s: StatusContrato): Exclude<FiltroContrato, 'todos'> | null {
  for (const f of FILTROS_CONTRATO) {
    if (f !== 'todos' && STATUS_DO_FILTRO[f]!.includes(s)) return f;
  }
  return null;
}

/** Quantos em cada filtro, a partir dos status efetivos. */
export function contagemPorFiltro(status: StatusContrato[]): Record<FiltroContrato, number> {
  const r = Object.fromEntries(FILTROS_CONTRATO.map((f) => [f, 0])) as Record<
    FiltroContrato,
    number
  >;
  for (const s of status) {
    r.todos += 1;
    const f = filtroDoStatus(s);
    if (f) r[f] += 1;
  }
  return r;
}

/** O que dá para fazer com o contrato, pelo status efetivo (o banco confere de novo). */
export function acoesDoContrato(s: StatusContrato): {
  reenviar: boolean;
  novoLink: boolean;
  cancelar: boolean;
  refazer: boolean;
  pdf: boolean;
} {
  return {
    // lembrar o cliente (gera link novo: o anterior para de abrir)
    reenviar: s === 'enviado',
    novoLink: s === 'expirado',
    cancelar: s === 'enviado' || s === 'recusado' || s === 'expirado',
    refazer: s === 'enviado' || s === 'recusado' || s === 'expirado' || s === 'cancelado',
    pdf: s === 'concluido',
  };
}

export type EventoAuditoria = {
  acao: string;
  criadoEm: string;
  usuarioNome: string | null;
  dados: Record<string, unknown>;
};

export type ItemLinhaDoTempo = { quando: string; texto: string; destaque: boolean };

const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Texto de cada evento do contrato. null = não aparece na linha do tempo. */
export function textoDoEvento(e: EventoAuditoria): { texto: string; destaque: boolean } | null {
  const quem = e.usuarioNome ?? 'Alguém do buffet';
  switch (e.acao) {
    case 'contrato.enviado':
      return {
        texto: `${quem} assinou pelo buffet e enviou${Number(e.dados.versao) > 1 ? ` (versão ${Number(e.dados.versao)})` : ''}`,
        destaque: false,
      };
    case 'contrato.visualizado':
      return {
        texto: e.dados.primeira === true ? 'Cliente abriu o contrato' : 'Cliente abriu de novo',
        destaque: false,
      };
    case 'contrato.codigo_pedido':
      return { texto: 'Cliente pediu o código por e-mail', destaque: false };
    case 'contrato.assinado':
      return { texto: 'Cliente assinou', destaque: true };
    case 'contrato.recusado':
      return { texto: 'Cliente pediu ajuste', destaque: true };
    case 'contrato.link_novo':
      return { texto: `${quem} gerou um link novo (o anterior parou de abrir)`, destaque: false };
    case 'contrato.cancelado': {
      if (!e.usuarioNome && !txt(e.dados.motivo)) return { texto: 'Cancelado', destaque: false };
      const motivo = txt(e.dados.motivo);
      return {
        texto:
          motivo === 'Refeito'
            ? 'Cancelado: foi refeito em um contrato novo'
            : `${quem} cancelou${motivo ? `: ${motivo}` : ''}`,
        destaque: false,
      };
    }
    case 'contrato.expirado':
      return { texto: 'O link venceu sem assinatura', destaque: false };
    case 'contrato.cpf_visto':
      return { texto: `${quem} viu o CPF completo`, destaque: false };
    case 'contrato.copia_email':
      return { texto: 'Cópia assinada enviada ao e-mail do cliente', destaque: false };
    case 'contrato.anonimizado':
      return { texto: 'Dados do cliente removidos (LGPD)', destaque: false };
    default:
      return null;
  }
}

/** Linha do tempo em ordem (mais antigo primeiro). */
export function linhaDoTempoContrato(eventos: EventoAuditoria[]): ItemLinhaDoTempo[] {
  return [...eventos]
    .sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime())
    .flatMap((e) => {
      const t = textoDoEvento(e);
      return t ? [{ quando: e.criadoEm, ...t }] : [];
    });
}
