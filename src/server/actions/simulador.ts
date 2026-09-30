'use server';

import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { hojeNoFuso } from '@/domain/dates';
import { percentualTextoParaBp } from '@/domain/percent';
import { calcularOrcamento, entradaOrcamentoSchema, type ResultadoOrcamento } from '@/domain/preco';
import { exigirPerfil } from '@/server/auth/guards';
import { carregarContexto } from '@/server/catalogo/carregar';
import { usuarios } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';

/** O cliente não informa "hoje" nem o limite de desconto: os dois vêm do servidor. */
const entradaSimuladorSchema = entradaOrcamentoSchema.omit({ hoje: true, limiteDescontoBp: true });
export type EntradaSimulador = z.input<typeof entradaSimuladorSchema>;

export type RespostaSimulador =
  { ok: true; resultado: ResultadoOrcamento } | { ok: false; erro: string };

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
  return { ok: true, resultado };
}
