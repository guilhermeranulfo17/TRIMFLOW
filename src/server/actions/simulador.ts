'use server';

import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { hojeNoFuso } from '@/domain/dates';
import { percentualTextoParaBp } from '@/domain/percent';
import { calcularOrcamento, entradaOrcamentoSchema, type ResultadoOrcamento } from '@/domain/preco';
import { exigirPerfil } from '@/server/auth/guards';
import type { EstadoSlot } from '@/domain/agenda';
import { carregarDisponibilidade } from '@/server/agenda/carregar';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { carregarContexto } from '@/server/catalogo/carregar';
import { usuarios } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';

/** O cliente não informa "hoje" nem o limite de desconto: os dois vêm do servidor. */
const entradaSimuladorSchema = entradaOrcamentoSchema.omit({ hoje: true, limiteDescontoBp: true });
export type EntradaSimulador = z.input<typeof entradaSimuladorSchema>;

/** Estado do slot escolhido na agenda (null quando espaço/turno não existem nesse dia). */
export type SlotSimulador = { estado: EstadoSlot; vagas: number; capacidade: number } | null;

export type RespostaSimulador =
  { ok: true; resultado: ResultadoOrcamento; slot: SlotSimulador } | { ok: false; erro: string };

/** Simulador interno (só dono): carrega o catálogo da empresa e roda o motor no servidor. */
export async function simularOrcamento(entrada: EntradaSimulador): Promise<RespostaSimulador> {
  const dono = await exigirPerfil('dono');
  const parsed = entradaSimuladorSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, erro: 'Confira os campos do simulador.' };

  const [dados] = await comUsuario(dono.id, (tx) =>
    tx
      .select({ limite: usuarios.limiteDescontoPct })
      .from(usuarios)
      .where(eq(usuarios.id, dono.id)),
  );
  const contexto = await carregarContexto(dono.id);
  if (!dados || !contexto) return { ok: false, erro: 'Não foi possível carregar seu catálogo.' };

  const resultado = calcularOrcamento(contexto, {
    ...parsed.data,
    hoje: hojeNoFuso(dono.empresa.fuso),
    limiteDescontoBp: percentualTextoParaBp(dados.limite),
  });
  return { ok: true, resultado, slot: await estadoDoSlotEscolhido(dono, parsed.data) };
}

/** O mesmo estado que a agenda mostra (função `disponibilidade` do banco). */
async function estadoDoSlotEscolhido(
  dono: UsuarioAtual,
  entrada: { data: string; turnoId: string; espacoId: string },
): Promise<SlotSimulador> {
  try {
    const slots = await carregarDisponibilidade(dono, entrada.data, entrada.data, entrada.espacoId);
    const slot = slots.find((s) => s.turnoId === entrada.turnoId);
    return slot ? { estado: slot.estado, vagas: slot.vagas, capacidade: slot.capacidade } : null;
  } catch {
    return null;
  }
}
