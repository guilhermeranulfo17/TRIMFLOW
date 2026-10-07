import 'server-only';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { agruparClientes, type Cliente, type FestaDoCliente } from '@/domain/clientes';
import type { StatusContrato } from '@/domain/contratos/estados';
import { hojeNoFuso, type DataCivil } from '@/domain/dates';
import {
  recebimentosComSinalDaAgenda,
  situacaoFinanceira,
  type ParcelaPlano,
  type StatusFinanceiro,
} from '@/domain/financeiro';
import type { OrigemLead } from '@/domain/publico/tipos';
import type { UsuarioAtual } from '@/server/auth/sessao';
import {
  espacos,
  leads,
  recebimentos,
  reservaParcelas,
  reservas,
  tiposEvento,
  turnos,
} from '@/server/db/schema';
import { naTransacao, type Tx } from '@/server/db/tenant';

/*
 * Leituras da aba Clientes (Etapa 12): reservas confirmadas (ativa ou realizada) de toda a
 * empresa, com o lead da reserva ou, na reserva feita direto na Agenda, o lead do mesmo WhatsApp.
 * Lead de teste e lead anonimizado (LGPD) ficam de fora. O agrupamento sai de domain/clientes.
 */

const leadDoZap = alias(leads, 'lead_do_zap');

type Linha = {
  reservaId: string;
  data: string;
  status: 'ativa' | 'realizada' | 'vencida' | 'cancelada';
  clienteNome: string;
  clienteZap: string | null;
  valor: number | null;
  tipoEvento: string | null;
  espaco: string | null;
  turno: string | null;
  convidados: number | null;
  orcamentoId: string | null;
  sinal: number | null;
  sinalPagoEm: string | null;
  leadId: string | null;
  leadNome: string | null;
  leadZap: string | null;
  leadStatus: FestaDoCliente['statusLead'];
  zapId: string | null;
  zapNome: string | null;
  zapStatus: FestaDoCliente['statusLead'];
};

/** Todas as festas de clientes da empresa (uma ida). */
function consultarFestas(t: Tx) {
  return t
    .select({
      reservaId: reservas.id,
      data: reservas.data,
      status: reservas.status,
      clienteNome: reservas.clienteNome,
      clienteZap: reservas.clienteWhatsappE164,
      valor: reservas.valorTotalCentavos,
      tipoEvento: tiposEvento.nome,
      espaco: espacos.nome,
      turno: turnos.nome,
      convidados: reservas.convidados,
      orcamentoId: reservas.orcamentoId,
      sinal: reservas.sinalCentavos,
      sinalPagoEm: reservas.sinalPagoEm,
      leadId: leads.id,
      leadNome: leads.nome,
      leadZap: leads.whatsappE164,
      leadStatus: leads.status,
      zapId: leadDoZap.id,
      zapNome: leadDoZap.nome,
      zapStatus: leadDoZap.status,
    })
    .from(reservas)
    .leftJoin(leads, eq(leads.id, reservas.leadId))
    .leftJoin(
      leadDoZap,
      and(
        isNull(reservas.leadId),
        eq(leadDoZap.whatsappE164, reservas.clienteWhatsappE164),
        eq(leadDoZap.ehTeste, false),
        isNull(leadDoZap.anonimizadoEm),
      ),
    )
    .leftJoin(tiposEvento, eq(tiposEvento.id, reservas.tipoEventoId))
    .leftJoin(espacos, eq(espacos.id, reservas.espacoId))
    .leftJoin(turnos, eq(turnos.id, reservas.turnoId))
    .where(
      and(
        eq(reservas.tipo, 'confirmada'),
        inArray(reservas.status, ['ativa', 'realizada']),
        or(isNull(reservas.leadId), and(eq(leads.ehTeste, false), isNull(leads.anonimizadoEm))),
      ),
    ) as unknown as Promise<Linha[]>;
}

function paraFesta(l: Linha): FestaDoCliente {
  const leadId = l.leadId ?? l.zapId;
  return {
    reservaId: l.reservaId,
    leadId,
    nome: l.leadNome ?? l.zapNome ?? l.clienteNome,
    whatsapp: l.leadId ? l.leadZap : (l.clienteZap ?? null),
    data: l.data,
    status: l.status as FestaDoCliente['status'],
    valorTotalCentavos: l.valor,
    tipoEvento: l.tipoEvento,
    statusLead: l.leadId ? l.leadStatus : l.zapStatus,
  };
}

export type TodosClientes = { hoje: DataCivil; clientes: Cliente[] };

export async function carregarClientes(usuario: UsuarioAtual, tx?: Tx): Promise<TodosClientes> {
  const hoje = hojeNoFuso(usuario.empresa.fuso);
  return naTransacao(usuario.id, tx, async (t) => {
    const linhas = await consultarFestas(t);
    return { hoje, clientes: agruparClientes(linhas.map(paraFesta), hoje) };
  });
}

export type FestaDaFicha = FestaDoCliente & {
  espaco: string | null;
  turno: string | null;
  convidados: number | null;
  /** só o dono */
  contrato: StatusContrato | null;
  financeiro: { status: StatusFinanceiro; recebidoCentavos: number; saldoCentavos: number } | null;
};

export type FichaCliente = {
  hoje: DataCivil;
  cliente: Cliente;
  festas: FestaDaFicha[];
  lead: { email: string | null; origem: OrigemLead } | null;
};

/**
 * Ficha de um cliente pelo id da ficha: o lead ou, sem lead, uma das reservas dele. Duas idas
 * para o dono (festas; contratos, planos e recebimentos em pipeline), uma para o vendedor.
 */
export async function carregarFichaCliente(
  usuario: UsuarioAtual,
  id: string,
  tx?: Tx,
): Promise<FichaCliente | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const hoje = hojeNoFuso(usuario.empresa.fuso);
  const dono = usuario.perfil === 'dono';
  return naTransacao(usuario.id, tx, async (t) => {
    const linhas = await consultarFestas(t);
    const porId = new Map(linhas.map((l) => [l.reservaId, l]));
    const todas = linhas.map(paraFesta);
    const alvo = todas.find((f) => f.leadId === id) ?? todas.find((f) => f.reservaId === id);
    if (!alvo) return null;
    const cliente = agruparClientes(todas, hoje).find((c) =>
      c.festas.some((f) => f.reservaId === alvo.reservaId),
    )!;
    const ids = cliente.festas.map((f) => f.reservaId);

    const [extras, planos, recs, dadosLead] = await Promise.all([
      dono
        ? t
            .select({
              id: reservas.id,
              contrato: sql<StatusContrato | null>`public.status_contrato_da_reserva(${reservas.id}, ${reservas.orcamentoId})`,
            })
            .from(reservas)
            .where(inArray(reservas.id, ids))
        : Promise.resolve([]),
      dono
        ? t
            .select({
              reservaId: reservaParcelas.reservaId,
              descricao: reservaParcelas.descricao,
              valorCentavos: reservaParcelas.valorCentavos,
              venceEm: reservaParcelas.venceEm,
            })
            .from(reservaParcelas)
            .where(inArray(reservaParcelas.reservaId, ids))
        : Promise.resolve([]),
      dono
        ? t
            .select({
              reservaId: recebimentos.reservaId,
              valorCentavos: recebimentos.valorCentavos,
              recebidoEm: recebimentos.recebidoEm,
              estornadoEm: recebimentos.estornadoEm,
            })
            .from(recebimentos)
            .where(inArray(recebimentos.reservaId, ids))
        : Promise.resolve([]),
      cliente.leadId
        ? t
            .select({ email: leads.email, origem: leads.origem })
            .from(leads)
            .where(eq(leads.id, cliente.leadId))
            .limit(1)
        : Promise.resolve([]),
    ]);

    const contratoDe = new Map(extras.map((e) => [e.id, e.contrato]));
    const festas: FestaDaFicha[] = cliente.festas.map((f) => {
      const l = porId.get(f.reservaId)!;
      let financeiro: FestaDaFicha['financeiro'] = null;
      if (dono) {
        const plano: ParcelaPlano[] = planos
          .filter((p) => p.reservaId === f.reservaId)
          .map((p) => ({
            descricao: p.descricao,
            valorCentavos: p.valorCentavos,
            venceEm: p.venceEm,
          }));
        const rs = recebimentosComSinalDaAgenda(
          recs
            .filter((r) => r.reservaId === f.reservaId)
            .map((r) => ({
              valorCentavos: r.valorCentavos,
              recebidoEm: r.recebidoEm,
              estornado: !!r.estornadoEm,
            })),
          plano.length > 0,
          { centavos: l.sinal, pagoEm: l.sinalPagoEm },
        );
        const s = situacaoFinanceira(plano, rs, hoje, l.valor);
        financeiro = {
          status: s.status,
          recebidoCentavos: s.recebidoCentavos,
          saldoCentavos: s.saldoCentavos,
        };
      }
      return {
        ...f,
        espaco: l.espaco,
        turno: l.turno,
        convidados: l.convidados,
        contrato: dono ? (contratoDe.get(f.reservaId) ?? null) : null,
        financeiro,
      };
    });
    const [dl] = dadosLead;
    return {
      hoje,
      cliente,
      festas,
      lead: dl ? { email: dl.email, origem: dl.origem as OrigemLead } : null,
    };
  });
}
