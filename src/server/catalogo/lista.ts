import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { UsuarioAtual } from '@/server/auth/sessao';
import type { espacos, opcionais, pacotes, tiposEvento, turnos } from '@/server/db/schema';
import type { Tx } from '@/server/db/tenant';

/** Tabelas do catálogo com `ordem` que o dono reordena pela interface. */
export type TabelaOrdenavel =
  typeof espacos | typeof turnos | typeof tiposEvento | typeof pacotes | typeof opcionais;

/** Próxima posição no fim da lista (o RLS já limita à empresa do usuário). */
export async function proximaOrdem(tx: Tx, tabela: TabelaOrdenavel): Promise<number> {
  const [linha] = await tx
    .select({ max: sql<number | null>`max(${tabela.ordem})` })
    .from(tabela as typeof espacos);
  return (linha?.max ?? -1) + 1;
}

/** Grava a nova ordem: posição = índice na lista recebida. Ids de outra empresa são ignorados. */
export async function gravarOrdem(
  tx: Tx,
  tabela: TabelaOrdenavel,
  dono: UsuarioAtual,
  ids: string[],
) {
  if (ids.length === 0) return;
  const t = tabela as typeof espacos;
  const existentes = await tx
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.empresaId, dono.empresa.id), inArray(t.id, ids)));
  const validos = new Set(existentes.map((e) => e.id));
  for (const [ordem, id] of ids.entries()) {
    if (validos.has(id)) await tx.update(t).set({ ordem }).where(eq(t.id, id));
  }
}
