import {
  STATUS_LEAD,
  TEMPERATURAS,
  type StatusLead,
  type TemperaturaLead,
} from '../publico/status-lead';
import type { OrigemLead } from '../publico/tipos';

/*
 * Filtros da caixa de leads ↔ URL (compartilhável; voltar do navegador mantém os filtros).
 * Tudo validado: valor desconhecido na URL é ignorado, nunca chega ao banco.
 */

export const ORIGENS_LEAD: OrigemLead[] = [
  'instagram',
  'google',
  'indicacao',
  'whatsapp',
  'link_direto',
  'interno',
  'outro',
];

export const ATALHOS_CAIXA = [
  'pre_reservas',
  'visitas',
  'tarefas_hoje',
  'atrasadas',
  'novos',
] as const;
export type AtalhoCaixa = (typeof ATALHOS_CAIXA)[number];

export type FiltrosCaixa = {
  status?: StatusLead[];
  temperatura?: TemperaturaLead[];
  origem?: OrigemLead[];
  /** "meus", "sem" (sem responsável) ou o id de um usuário */
  responsavel?: string;
  eventoDe?: string;
  eventoAte?: string;
  atrasadas?: boolean;
  busca?: string;
  teste?: boolean;
  atalho?: AtalhoCaixa;
};

type Parametros = Record<string, string | string[] | undefined> | URLSearchParams;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function ler(p: Parametros, chave: string): string | undefined {
  if (p instanceof URLSearchParams) return p.get(chave) ?? undefined;
  const v = p[chave];
  return Array.isArray(v) ? v[0] : v;
}

function lista<T extends string>(
  valor: string | undefined,
  validos: readonly T[],
): T[] | undefined {
  if (!valor) return undefined;
  const itens = [...new Set(valor.split(','))].filter((x): x is T =>
    (validos as readonly string[]).includes(x),
  );
  return itens.length ? itens : undefined;
}

export function filtrosDaUrl(p: Parametros): FiltrosCaixa {
  const f: FiltrosCaixa = {};
  const status = lista(ler(p, 'status'), STATUS_LEAD);
  const temperatura = lista(ler(p, 'temp'), TEMPERATURAS);
  const origem = lista(ler(p, 'origem'), ORIGENS_LEAD);
  const resp = ler(p, 'resp');
  const de = ler(p, 'de');
  const ate = ler(p, 'ate');
  const busca = ler(p, 'q')?.trim().slice(0, 60);
  const atalho = ler(p, 'ver');
  if (status) f.status = status;
  if (temperatura) f.temperatura = temperatura;
  if (origem) f.origem = origem;
  if (resp && (resp === 'meus' || resp === 'sem' || UUID.test(resp))) f.responsavel = resp;
  if (de && DATA.test(de)) f.eventoDe = de;
  if (ate && DATA.test(ate)) f.eventoAte = ate;
  if (ler(p, 'atrasadas') === '1') f.atrasadas = true;
  if (busca) f.busca = busca;
  if (ler(p, 'teste') === '1') f.teste = true;
  if (atalho && (ATALHOS_CAIXA as readonly string[]).includes(atalho)) {
    f.atalho = atalho as AtalhoCaixa;
  }
  return f;
}

/** Query string (sem "?"), na mesma ordem sempre: links iguais para filtros iguais. */
export function filtrosParaUrl(f: FiltrosCaixa): string {
  const p = new URLSearchParams();
  if (f.atalho) p.set('ver', f.atalho);
  if (f.busca) p.set('q', f.busca);
  if (f.status?.length) p.set('status', f.status.join(','));
  if (f.temperatura?.length) p.set('temp', f.temperatura.join(','));
  if (f.origem?.length) p.set('origem', f.origem.join(','));
  if (f.responsavel) p.set('resp', f.responsavel);
  if (f.eventoDe) p.set('de', f.eventoDe);
  if (f.eventoAte) p.set('ate', f.eventoAte);
  if (f.atrasadas) p.set('atrasadas', '1');
  if (f.teste) p.set('teste', '1');
  return p.toString();
}

/** Objeto para public.caixa_leads(p_filtros jsonb). */
export function filtrosParaSql(f: FiltrosCaixa): Record<string, unknown> {
  const j: Record<string, unknown> = {};
  if (f.status?.length) j.status = f.status;
  if (f.temperatura?.length) j.temperatura = f.temperatura;
  if (f.origem?.length) j.origem = f.origem;
  if (f.responsavel) j.responsavel = f.responsavel;
  if (f.eventoDe) j.evento_de = f.eventoDe;
  if (f.eventoAte) j.evento_ate = f.eventoAte;
  if (f.atrasadas) j.atrasadas = true;
  if (f.busca) j.busca = f.busca;
  if (f.teste) j.teste = true;
  if (f.atalho) j.atalho = f.atalho;
  return j;
}

/** Quantos filtros do sheet estão ligados (busca e atalho do topo não contam). */
export function contarFiltros(f: FiltrosCaixa): number {
  return [
    f.status?.length,
    f.temperatura?.length,
    f.origem?.length,
    f.responsavel,
    f.eventoDe || f.eventoAte,
    f.atrasadas,
    f.teste,
  ].filter(Boolean).length;
}

export const ROTULO_ATALHO: Record<AtalhoCaixa, string> = {
  pre_reservas: 'Pré-reservas vencendo',
  visitas: 'Visitas',
  tarefas_hoje: 'Tarefas de hoje',
  atrasadas: 'Atrasadas',
  novos: 'Novos sem contato',
};
