'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { normalizarHora } from '@/domain/conversao';
import { idSchema } from '@/domain/validacao/comum';
import {
  espacoSchema,
  ordemSchema,
  turnoSchema,
  type EspacoEntrada,
  type TurnoEntrada,
} from '@/domain/validacao/catalogo';
import { gravarOrdem, proximaOrdem } from '@/server/catalogo/lista';
import { espacos, reservas, turnos } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import {
  acaoDoDono,
  auditar,
  diferencas,
  NAO_ENCONTRADO,
  validar,
  type ResultadoAcao,
} from './comum';

/** Espaço/turno com reservas não pode ser excluído (a FK recusaria com erro técnico). */
async function temReservas(usuarioId: string, tipo: 'espaco' | 'turno', id: string) {
  const coluna = tipo === 'espaco' ? reservas.espacoId : reservas.turnoId;
  const [linha] = await comUsuario(usuarioId, (tx) =>
    tx.select({ id: reservas.id }).from(reservas).where(eq(coluna, id)).limit(1),
  );
  return !!linha;
}

function revalidar() {
  // O layout recalcula as pendências (badge do menu).
  revalidatePath('/app', 'layout');
}

// ---------------------------------------------------------------------------
// Espaços
// ---------------------------------------------------------------------------

export async function salvarEspaco(
  id: string | null,
  entrada: EspacoEntrada,
): Promise<ResultadoAcao<{ id: string }>> {
  return acaoDoDono<{ id: string }>(async (dono) => {
    const v = validar(espacoSchema, entrada);
    if (!v.ok) return v.resultado;
    if (id !== null && !idSchema.safeParse(id).success) return { ok: false, erro: NAO_ENCONTRADO };
    const dados = v.dados;
    const salvoId = await comUsuario(dono.id, async (tx) => {
      if (id === null) {
        const [novo] = await tx
          .insert(espacos)
          .values({ ...dados, empresaId: dono.empresa.id, ordem: await proximaOrdem(tx, espacos) })
          .returning({ id: espacos.id });
        await auditar(tx, dono, 'espaco.criado', 'espaco', novo!.id, { depois: dados });
        return novo!.id;
      }
      const [antes] = await tx.select().from(espacos).where(eq(espacos.id, id));
      if (!antes) return null;
      await tx.update(espacos).set(dados).where(eq(espacos.id, id));
      await auditar(tx, dono, 'espaco.alterado', 'espaco', id, diferencas(antes, dados));
      return id;
    });
    if (!salvoId) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar();
    return { ok: true, mensagem: id ? 'Espaço salvo.' : 'Espaço criado.', dados: { id: salvoId } };
  });
}

export async function excluirEspaco(id: string): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    if (!idSchema.safeParse(id).success) return { ok: false, erro: NAO_ENCONTRADO };
    if (await temReservas(dono.id, 'espaco', id)) {
      return { ok: false, erro: 'Este espaço tem reservas na agenda. Desative em vez de excluir.' };
    }
    const apagado = await comUsuario(dono.id, async (tx) => {
      const [linha] = await tx
        .delete(espacos)
        .where(and(eq(espacos.id, id), eq(espacos.empresaId, dono.empresa.id)))
        .returning();
      if (linha) await auditar(tx, dono, 'espaco.excluido', 'espaco', id, { antes: linha });
      return !!linha;
    });
    if (!apagado) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar();
    return { ok: true, mensagem: 'Espaço excluído.' };
  });
}

export async function reordenarEspacos(ids: string[]): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(ordemSchema, { ids });
    if (!v.ok) return v.resultado;
    await comUsuario(dono.id, (tx) => gravarOrdem(tx, espacos, dono, v.dados.ids));
    revalidar();
    return { ok: true, mensagem: 'Ordem salva.' };
  });
}

// ---------------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------------

export async function salvarTurno(
  id: string | null,
  entrada: TurnoEntrada,
): Promise<ResultadoAcao<{ id: string }>> {
  return acaoDoDono<{ id: string }>(async (dono) => {
    const v = validar(turnoSchema, entrada);
    if (!v.ok) return v.resultado;
    if (id !== null && !idSchema.safeParse(id).success) return { ok: false, erro: NAO_ENCONTRADO };
    const dados = {
      ...v.dados,
      diasSemana: [...new Set(v.dados.diasSemana)].sort((a, b) => a - b),
    };
    const salvoId = await comUsuario(dono.id, async (tx) => {
      if (id === null) {
        const [novo] = await tx
          .insert(turnos)
          .values({ ...dados, empresaId: dono.empresa.id, ordem: await proximaOrdem(tx, turnos) })
          .returning({ id: turnos.id });
        await auditar(tx, dono, 'turno.criado', 'turno', novo!.id, { depois: dados });
        return novo!.id;
      }
      const [antes] = await tx.select().from(turnos).where(eq(turnos.id, id));
      if (!antes) return null;
      await tx.update(turnos).set(dados).where(eq(turnos.id, id));
      await auditar(
        tx,
        dono,
        'turno.alterado',
        'turno',
        id,
        diferencas({ ...antes, horaInicio: normalizarHora(antes.horaInicio) }, dados),
      );
      return id;
    });
    if (!salvoId) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar();
    return { ok: true, mensagem: id ? 'Turno salvo.' : 'Turno criado.', dados: { id: salvoId } };
  });
}

export async function excluirTurno(id: string): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    if (!idSchema.safeParse(id).success) return { ok: false, erro: NAO_ENCONTRADO };
    if (await temReservas(dono.id, 'turno', id)) {
      return { ok: false, erro: 'Este turno tem reservas na agenda. Desative em vez de excluir.' };
    }
    const apagado = await comUsuario(dono.id, async (tx) => {
      const [linha] = await tx
        .delete(turnos)
        .where(and(eq(turnos.id, id), eq(turnos.empresaId, dono.empresa.id)))
        .returning();
      if (linha) await auditar(tx, dono, 'turno.excluido', 'turno', id, { antes: linha });
      return !!linha;
    });
    if (!apagado) return { ok: false, erro: NAO_ENCONTRADO };
    revalidar();
    return { ok: true, mensagem: 'Turno excluído.' };
  });
}

export async function reordenarTurnos(ids: string[]): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(ordemSchema, { ids });
    if (!v.ok) return v.resultado;
    await comUsuario(dono.id, (tx) => gravarOrdem(tx, turnos, dono, v.dados.ids));
    revalidar();
    return { ok: true, mensagem: 'Ordem salva.' };
  });
}
