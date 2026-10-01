import 'server-only';
import { sql } from 'drizzle-orm';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { comUsuario } from '@/server/db/tenant';

export type TabelaCatalogo = 'pacotes' | 'opcionais' | 'turnos' | 'espacos' | 'tipos_evento';

/**
 * Ids do catálogo que já aparecem em algum orçamento: esses não podem ser excluídos (o banco
 * recusa com CATALOGO_ITEM_EM_USO), só desativados. As telas trocam "Excluir" por "Desativar".
 */
export async function carregarEmUso(
  usuario: UsuarioAtual,
): Promise<Record<TabelaCatalogo, string[]>> {
  const linhas = await comUsuario(usuario.id, (tx) =>
    tx.execute<{ tabela: TabelaCatalogo; id: string }>(
      sql`select tabela, id from public.catalogo_em_uso()`,
    ),
  );
  const mapa: Record<TabelaCatalogo, string[]> = {
    pacotes: [],
    opcionais: [],
    turnos: [],
    espacos: [],
    tipos_evento: [],
  };
  for (const l of linhas) mapa[l.tabela]?.push(l.id);
  return mapa;
}
