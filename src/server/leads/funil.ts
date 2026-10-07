import 'server-only';
import { sql } from 'drizzle-orm';
import { diaDaSemana, formatData } from '@/domain/dates';
import {
  ETAPAS_FUNIL,
  filtrosParaSql,
  proximoPasso,
  type EtapaFunil,
  type FiltrosCaixa,
  type StatusOrcamento,
} from '@/domain/leads';
import type { StatusLead, TemperaturaLead } from '@/domain/publico/status-lead';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { naTransacao, type Tx } from '@/server/db/tenant';

/*
 * Funil de leads (Etapa 13): public.funil_leads devolve até 50 cards por etapa, já com o total e
 * a soma das propostas da etapa (uma consulta, RLS do usuário). Os filtros são os da caixa,
 * menos status e atalhos.
 */

export const CARDS_POR_ETAPA = 50;

export type CardFunil = {
  id: string;
  nome: string;
  status: StatusLead;
  temperatura: TemperaturaLead;
  ehTeste: boolean;
  responsavel: { nome: string; iniciais: string } | null;
  etapa: EtapaFunil;
  totalCentavos: number | null;
  /** "Infantil · sáb 14/11" */
  festa: string;
  passo: { texto: string; atrasado: boolean } | null;
  /** pré-reserva ativa: quando vence */
  preReservaExpiraEm: string | null;
  orcamentoParaReservar: string | null;
  temOrcamento: boolean;
};

export type ColunaFunil = {
  etapa: EtapaFunil;
  total: number;
  somaCentavos: number;
  cards: CardFunil[];
};

type Linha = {
  id: string;
  nome: string;
  status: StatusLead;
  temperatura: TemperaturaLead;
  eh_teste: boolean;
  responsavel_nome: string | null;
  etapa: EtapaFunil;
  etapa_total: number;
  etapa_soma_centavos: string | number;
  orcamento_id: string | null;
  orcamento_status: StatusOrcamento | null;
  orcamento_reservavel: boolean;
  total_centavos: number | null;
  evento_data: string | Date | null;
  evento_tipo: string | null;
  pre_reserva_expira_em: Date | string | null;
  tarefa_vence: Date | string | null;
  tarefa_titulo: string | null;
};

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? (p.at(-1)?.[0] ?? '') : '')).toUpperCase();
}

const civil = (v: string | Date | null) =>
  v === null ? null : typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);

export async function carregarFunil(
  usuario: UsuarioAtual,
  filtros: FiltrosCaixa,
  tx?: Tx,
): Promise<ColunaFunil[]> {
  const linhas = await naTransacao(usuario.id, tx, (t) =>
    t.execute<Linha>(sql`select * from public.funil_leads(
      ${JSON.stringify(filtrosParaSql({ ...filtros, status: undefined, atalho: undefined, atrasadas: undefined }))}::jsonb,
      ${CARDS_POR_ETAPA})`),
  );
  const agora = new Date();
  const colunas = new Map<EtapaFunil, ColunaFunil>(
    ([...ETAPAS_FUNIL, 'perdido'] as EtapaFunil[]).map((e) => [
      e,
      { etapa: e, total: 0, somaCentavos: 0, cards: [] },
    ]),
  );
  for (const r of linhas) {
    const c = colunas.get(r.etapa);
    if (!c) continue;
    c.total = Number(r.etapa_total);
    c.somaCentavos = Number(r.etapa_soma_centavos);
    const data = civil(r.evento_data);
    c.cards.push({
      id: r.id,
      nome: r.nome,
      status: r.status,
      temperatura: r.temperatura,
      ehTeste: r.eh_teste,
      responsavel: r.responsavel_nome
        ? { nome: r.responsavel_nome, iniciais: iniciais(r.responsavel_nome) }
        : null,
      etapa: r.etapa,
      totalCentavos: r.total_centavos,
      festa: [
        r.evento_tipo,
        data ? `${diaDaSemana(data).slice(0, 3)} ${formatData(data).slice(0, 5)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      passo: proximoPasso(
        r.tarefa_titulo && r.tarefa_vence
          ? { titulo: r.tarefa_titulo, vence: new Date(r.tarefa_vence) }
          : null,
        agora,
        usuario.empresa.fuso,
      ),
      preReservaExpiraEm: r.pre_reserva_expira_em
        ? new Date(r.pre_reserva_expira_em).toISOString()
        : null,
      orcamentoParaReservar: r.orcamento_reservavel ? r.orcamento_id : null,
      temOrcamento: !!r.orcamento_id,
    });
  }
  return [...colunas.values()];
}
