'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { celularBRParaE164 } from '@/domain/phone';
import {
  bloqueioSchema,
  cancelarSchema,
  confirmarSchema,
  estenderSchema,
  reservaSchema,
  type BloqueioEntrada,
  type ConfirmarEntrada,
  type ReservaEntrada,
} from '@/domain/validacao/agenda';
import { acaoDaAgenda } from '@/server/agenda/erros';
import { carregarDia, type DiaAgenda } from '@/server/agenda/carregar';
import { comUsuario } from '@/server/db/tenant';
import { idValido, NAO_ENCONTRADO, validar, type ResultadoAcao } from './empresa/comum';

/*
 * Ações da agenda. Toda escrita vai pelas funções SQL (criar_reserva, criar_bloqueio…), que
 * travam a empresa, checam conflito e gravam auditoria. Dono e vendedor reservam; só o dono
 * bloqueia.
 */

function revalidar() {
  revalidatePath('/app/agenda');
  // confirmar ou cancelar pelo lead e pela Agenda dá o mesmo resultado (e a caixa muda)
  revalidatePath('/app/leads', 'layout');
}

export async function criarReserva(
  entrada: ReservaEntrada,
): Promise<ResultadoAcao<{ id: string }>> {
  return acaoDaAgenda<{ id: string }>(['dono', 'vendedor'], async (usuario) => {
    const v = validar(reservaSchema, entrada);
    if (!v.ok) return v.resultado;
    const d = v.dados;
    const [linha] = await comUsuario(usuario.id, (tx) =>
      tx.execute<{ id: string }>(sql`select public.criar_reserva(
        ${d.espacoId}::uuid, ${d.turnoId}::uuid, ${d.data}::date,
        ${d.tipo}::public.tipo_reserva, ${d.clienteNome},
        ${d.clienteWhatsapp ? celularBRParaE164(d.clienteWhatsapp) : null},
        ${d.tipoEventoId || null}::uuid, ${d.convidados}::integer,
        ${d.valorTotalCentavos}::integer, ${d.sinalCentavos}::integer,
        ${d.sinalPagoEm || null}::date, ${d.observacoes || null},
        'manual'::public.origem_reserva) as id`),
    );
    revalidar();
    return {
      ok: true,
      mensagem: d.tipo === 'confirmada' ? 'Evento registrado na agenda.' : 'Pré-reserva criada.',
      dados: { id: linha!.id },
    };
  });
}

export async function confirmarReserva(
  id: string,
  entrada: ConfirmarEntrada,
): Promise<ResultadoAcao> {
  return acaoDaAgenda(['dono', 'vendedor'], async (usuario) => {
    if (!idValido(id)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(confirmarSchema, entrada);
    if (!v.ok) return v.resultado;
    await comUsuario(usuario.id, (tx) =>
      tx.execute(sql`select public.confirmar_reserva(${id}::uuid,
        ${v.dados.sinalCentavos}::integer, ${v.dados.sinalPagoEm || null}::date)`),
    );
    revalidar();
    return { ok: true, mensagem: 'Reserva confirmada.' };
  });
}

export async function cancelarReserva(
  id: string,
  entrada: { motivo: string },
): Promise<ResultadoAcao> {
  return acaoDaAgenda(['dono', 'vendedor'], async (usuario) => {
    if (!idValido(id)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(cancelarSchema, entrada);
    if (!v.ok) return v.resultado;
    await comUsuario(usuario.id, (tx) =>
      tx.execute(sql`select public.cancelar_reserva(${id}::uuid, ${v.dados.motivo || null})`),
    );
    revalidar();
    return { ok: true, mensagem: 'Cancelado. A data ficou livre.' };
  });
}

export async function estenderPreReserva(
  id: string,
  entrada: { horas: number },
): Promise<ResultadoAcao> {
  return acaoDaAgenda(['dono', 'vendedor'], async (usuario) => {
    if (!idValido(id)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(estenderSchema, entrada);
    if (!v.ok) return v.resultado;
    await comUsuario(usuario.id, (tx) =>
      tx.execute(sql`select public.estender_pre_reserva(${id}::uuid, ${v.dados.horas})`),
    );
    revalidar();
    return { ok: true, mensagem: `Prazo estendido em ${v.dados.horas}h.` };
  });
}

export async function bloquearDatas(
  entrada: BloqueioEntrada,
): Promise<ResultadoAcao<{ criados: number }>> {
  return acaoDaAgenda<{ criados: number }>(['dono'], async (dono) => {
    const v = validar(bloqueioSchema, entrada);
    if (!v.ok) return v.resultado;
    const b = v.dados;
    const [linha] = await comUsuario(dono.id, (tx) =>
      tx.execute<{ criados: number }>(sql`select public.criar_bloqueio(
        ${b.de}::date, ${b.ate}::date, ${b.turnoId || null}::uuid,
        ${b.espacoId || null}::uuid, ${b.motivo || null}) as criados`),
    );
    revalidar();
    const criados = Number(linha?.criados ?? 0);
    return {
      ok: true,
      mensagem: b.de === b.ate ? 'Data bloqueada.' : `Período bloqueado (${criados} dias).`,
      dados: { criados },
    };
  });
}

export async function desbloquear(id: string): Promise<ResultadoAcao> {
  return acaoDaAgenda(['dono'], async (dono) => {
    if (!idValido(id)) return { ok: false, erro: NAO_ENCONTRADO };
    await comUsuario(dono.id, (tx) => tx.execute(sql`select public.remover_bloqueio(${id}::uuid)`));
    revalidar();
    return { ok: true, mensagem: 'Bloqueio removido.' };
  });
}

/** Detalhes de um dia para o painel (slots, reservas e bloqueios). */
export async function detalhesDoDia(data: string): Promise<ResultadoAcao<DiaAgenda>> {
  return acaoDaAgenda<DiaAgenda>(['dono', 'vendedor'], async (usuario) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, erro: 'Data inválida.' };
    return { ok: true, mensagem: '', dados: await carregarDia(usuario, data) };
  });
}
