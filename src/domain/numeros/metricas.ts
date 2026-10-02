import { formatInTimeZone } from 'date-fns-tz';
import { FUSO_PADRAO, type DataCivil } from '../dates';
import type { StatusLead, TemperaturaLead } from '../publico/status-lead';
import type { OrigemLead } from '../publico/tipos';
import { mediana, razaoBp } from './mediana';
import { noPeriodo } from './periodo';

/*
 * Métricas da tela de Números (definições do documento). ESPELHO de public.numeros (SQL); o
 * teste de equivalência compara as duas numa tabela de casos. Mudou uma, mude a outra.
 *
 * Regras gerais:
 *  - conta LEADS ÚNICOS (nunca versões de orçamento) e NUNCA lead de teste (os fatos já chegam
 *    sem eles);
 *  - datas comparadas como data civil no fuso da empresa, período inclusivo;
 *  - "coorte": métricas de conversão olham os leads CRIADOS no período e o estado deles hoje;
 *    "evento": reservas e perdas contam pela data em que aconteceram.
 */

export type LeadFato = {
  id: string;
  criadoEm: Date;
  origem: OrigemLead;
  responsavelId: string | null;
  status: StatusLead;
  temperatura: TemperaturaLead;
  /** chegou ao passo 6 do wizard ou tem orçamento concluído (interno ou do link) */
  orcamentoCompleto: boolean;
  /** pediu pré-reserva ou visita (qualquer autor) */
  pediuPreOuVisita: boolean;
  /** tem reserva confirmada (ativa ou realizada) */
  temReservaConfirmada: boolean;
  /** status da versão vigente do orçamento (null = sem orçamento) */
  propostaStatus: string | null;
  totalVigenteCentavos: number | null;
  perdidoEm: Date | null;
  motivoPerda: string | null;
  /** primeira pré-reserva ou visita pedida PELO CLIENTE */
  acaoClienteEm: Date | null;
  /** primeira ação do vendedor depois de acaoClienteEm */
  contatoAposAcaoEm: Date | null;
  /** quando o aviso dessa ação saiu (avisos.agendado_para, depois do silêncio) */
  avisoEm: Date | null;
  /** primeira ação do vendedor depois de avisoEm */
  contatoAposAvisoEm: Date | null;
};

export type ReservaFato = {
  leadId: string;
  /** confirmada_em (ou criado_em, para reserva já criada confirmada) */
  confirmadaEm: Date;
  /** valor da reserva; sem valor, o total da versão vigente do lead; senão 0 */
  valorCentavos: number;
};

export type FunilFato = {
  sessao: string;
  evento: 'pagina_vista' | 'passo_visto' | 'passo_concluido' | 'abandono';
  passo: number;
  origem: OrigemLead;
  criadoEm: Date;
};

export type FatosNumeros = {
  leads: LeadFato[];
  reservas: ReservaFato[];
  funil: FunilFato[];
};

export type PeriodoCivil = { de: DataCivil; ate: DataCivil };

export const diaNoFuso = (d: Date, fuso: string = FUSO_PADRAO): DataCivil =>
  formatInTimeZone(d, fuso, 'yyyy-MM-dd');

const STATUS_RESERVADO: StatusLead[] = ['reservado', 'realizado'];
const STATUS_PERDIDO: StatusLead[] = ['perdido', 'cancelado'];
const STATUS_ABERTO: StatusLead[] = ['novo', 'em_andamento', 'abandonou', 'frio', 'pre_reservado'];

/** Lead decidido: reservado, perdido/cancelado ou com a proposta vigente expirada. */
export function leadDecidido(l: LeadFato): boolean {
  return (
    STATUS_RESERVADO.includes(l.status) ||
    STATUS_PERDIDO.includes(l.status) ||
    l.propostaStatus === 'expirado'
  );
}

/** Conta no "em aberto": em andamento, pré-reservado ou quente (ainda aberto). */
export function leadEmAberto(l: LeadFato): boolean {
  return (
    l.status === 'em_andamento' ||
    l.status === 'pre_reservado' ||
    (l.temperatura === 'quente' && STATUS_ABERTO.includes(l.status))
  );
}

export type Resumo = {
  /** sessões com pagina_vista */
  visitas: number;
  /** sessões que passaram do passo 1 */
  inicios: number;
  /** leads criados no período (todas as origens) */
  leads: number;
  /** funil (só leads do link, origem diferente de interno, criados no período) */
  funilLeads: number;
  funilCompletos: number;
  funilPreVisitas: number;
  funilReservas: number;
  /** leads com reserva confirmada no período (evento) */
  reservas: number;
  valorReservadoCentavos: number;
  /** coorte: leads do período decididos e reservados */
  decididos: number;
  reservadosDecididos: number;
  conversaoBp: number | null;
  /** foto de agora (não depende do período) */
  emAbertoCentavos: number;
};

/** Sessões que passaram do passo 1: concluíram um passo ≥ 1 ou viram um passo ≥ 2. */
export function sessaoIniciou(e: FunilFato): boolean {
  return (
    (e.evento === 'passo_concluido' && e.passo >= 1) || (e.evento === 'passo_visto' && e.passo >= 2)
  );
}

export function filtrarPorVendedor(f: FatosNumeros, vendedorId: string | null): FatosNumeros {
  if (!vendedorId) return f;
  const leads = f.leads.filter((l) => l.responsavelId === vendedorId);
  const ids = new Set(leads.map((l) => l.id));
  return { leads, reservas: f.reservas.filter((r) => ids.has(r.leadId)), funil: [] };
}

export function calcularResumo(
  f: FatosNumeros,
  p: PeriodoCivil,
  fuso: string = FUSO_PADRAO,
): Resumo {
  const dia = (d: Date) => diaNoFuso(d, fuso);
  const funilNoPeriodo = f.funil.filter((e) => noPeriodo(dia(e.criadoEm), p));
  const visitas = new Set(
    funilNoPeriodo.filter((e) => e.evento === 'pagina_vista').map((e) => e.sessao),
  ).size;
  const inicios = new Set(funilNoPeriodo.filter(sessaoIniciou).map((e) => e.sessao)).size;

  const coorte = f.leads.filter((l) => noPeriodo(dia(l.criadoEm), p));
  const doLink = coorte.filter((l) => l.origem !== 'interno');

  const reservasNoPeriodo = f.reservas.filter((r) => noPeriodo(dia(r.confirmadaEm), p));
  const decididos = coorte.filter(leadDecidido);
  const reservadosDecididos = decididos.filter((l) => STATUS_RESERVADO.includes(l.status)).length;

  return {
    visitas,
    inicios,
    leads: coorte.length,
    funilLeads: doLink.length,
    funilCompletos: doLink.filter((l) => l.orcamentoCompleto).length,
    funilPreVisitas: doLink.filter((l) => l.pediuPreOuVisita).length,
    funilReservas: doLink.filter((l) => l.temReservaConfirmada).length,
    reservas: new Set(reservasNoPeriodo.map((r) => r.leadId)).size,
    valorReservadoCentavos: reservasNoPeriodo.reduce((s, r) => s + r.valorCentavos, 0),
    decididos: decididos.length,
    reservadosDecididos,
    conversaoBp: razaoBp(reservadosDecididos, decididos.length),
    emAbertoCentavos: f.leads
      .filter(leadEmAberto)
      .reduce((s, l) => s + (l.totalVigenteCentavos ?? 0), 0),
  };
}

export type LinhaOrigem = {
  origem: OrigemLead;
  leads: number;
  reservas: number;
  conversaoBp: number | null;
  valorReservadoCentavos: number;
};

/** Por origem (do lead): ordenado por valor reservado, depois por leads e pelo nome da origem. */
export function porOrigem(
  f: FatosNumeros,
  p: PeriodoCivil,
  fuso: string = FUSO_PADRAO,
): LinhaOrigem[] {
  const origemDoLead = new Map(f.leads.map((l) => [l.id, l.origem]));
  const origens = new Set<OrigemLead>();
  const linhas = new Map<OrigemLead, LinhaOrigem>();
  const linha = (o: OrigemLead) => {
    origens.add(o);
    if (!linhas.has(o)) {
      linhas.set(o, {
        origem: o,
        leads: 0,
        reservas: 0,
        conversaoBp: null,
        valorReservadoCentavos: 0,
      });
    }
    return linhas.get(o)!;
  };
  const decididos = new Map<OrigemLead, [number, number]>();
  for (const l of f.leads) {
    if (!noPeriodo(diaNoFuso(l.criadoEm, fuso), p)) continue;
    linha(l.origem).leads += 1;
    if (leadDecidido(l)) {
      const [r, d] = decididos.get(l.origem) ?? [0, 0];
      decididos.set(l.origem, [r + (STATUS_RESERVADO.includes(l.status) ? 1 : 0), d + 1]);
    }
  }
  const reservados = new Map<OrigemLead, Set<string>>();
  for (const r of f.reservas) {
    if (!noPeriodo(diaNoFuso(r.confirmadaEm, fuso), p)) continue;
    const o = origemDoLead.get(r.leadId);
    if (!o) continue;
    linha(o).valorReservadoCentavos += r.valorCentavos;
    reservados.set(o, (reservados.get(o) ?? new Set()).add(r.leadId));
  }
  for (const o of origens) {
    const l = linhas.get(o)!;
    l.reservas = reservados.get(o)?.size ?? 0;
    const [r, d] = decididos.get(o) ?? [0, 0];
    l.conversaoBp = razaoBp(r, d);
  }
  return [...linhas.values()].sort(
    (a, b) =>
      b.valorReservadoCentavos - a.valorReservadoCentavos ||
      b.leads - a.leads ||
      a.origem.localeCompare(b.origem),
  );
}

export type LinhaMotivo = { motivo: string; quantidade: number; bp: number };

/** Leads perdidos no período (pela data da perda), por motivo; ordenado por quantidade. */
export function motivosDePerda(
  f: FatosNumeros,
  p: PeriodoCivil,
  fuso: string = FUSO_PADRAO,
): LinhaMotivo[] {
  const contagem = new Map<string, number>();
  for (const l of f.leads) {
    if (l.status !== 'perdido' || !l.perdidoEm || !noPeriodo(diaNoFuso(l.perdidoEm, fuso), p))
      continue;
    const m = l.motivoPerda ?? 'outro';
    contagem.set(m, (contagem.get(m) ?? 0) + 1);
  }
  const total = [...contagem.values()].reduce((s, n) => s + n, 0);
  return [...contagem.entries()]
    .map(([motivo, quantidade]) => ({ motivo, quantidade, bp: razaoBp(quantidade, total) ?? 0 }))
    .sort((a, b) => b.quantidade - a.quantidade || a.motivo.localeCompare(b.motivo));
}

export type LinhaAtendimento = {
  /** null = leads sem responsável */
  responsavelId: string | null;
  acoes: number;
  semContato: number;
  /** mediana em minutos entre a ação do cliente e a primeira ação do vendedor */
  medianaMin: number | null;
  /** mediana em minutos entre o aviso e a primeira ação do vendedor */
  medianaAvisoMin: number | null;
};

const minutos = (de: Date, ate: Date) =>
  Math.max(0, Math.round((ate.getTime() - de.getTime()) / 60_000));

/**
 * Tempo até a primeira ação: leads cuja ação do cliente (pré-reserva ou visita pedida) caiu no
 * período. Quem ainda não foi atendido conta em "semContato" e fica fora da mediana.
 * A primeira linha é o total (responsavelId = '*').
 */
export function atendimento(
  f: FatosNumeros,
  p: PeriodoCivil,
  fuso: string = FUSO_PADRAO,
): { total: LinhaAtendimento; porVendedor: LinhaAtendimento[] } {
  const comAcao = f.leads.filter(
    (l) => l.acaoClienteEm && noPeriodo(diaNoFuso(l.acaoClienteEm, fuso), p),
  );
  const montar = (responsavelId: string | null, ls: LeadFato[]): LinhaAtendimento => ({
    responsavelId,
    acoes: ls.length,
    semContato: ls.filter((l) => !l.contatoAposAcaoEm).length,
    medianaMin: mediana(
      ls
        .filter((l) => l.contatoAposAcaoEm)
        .map((l) => minutos(l.acaoClienteEm!, l.contatoAposAcaoEm!)),
    ),
    medianaAvisoMin: mediana(
      ls
        .filter((l) => l.avisoEm && l.contatoAposAvisoEm)
        .map((l) => minutos(l.avisoEm!, l.contatoAposAvisoEm!)),
    ),
  });
  const grupos = new Map<string | null, LeadFato[]>();
  for (const l of comAcao) grupos.set(l.responsavelId, [...(grupos.get(l.responsavelId) ?? []), l]);
  return {
    total: montar('*', comAcao),
    porVendedor: [...grupos.entries()]
      .map(([id, ls]) => montar(id, ls))
      .sort(
        (a, b) =>
          b.acoes - a.acoes || String(a.responsavelId).localeCompare(String(b.responsavelId)),
      ),
  };
}
