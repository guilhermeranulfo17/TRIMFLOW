import 'server-only';
import { count, eq } from 'drizzle-orm';
import { cache } from 'react';
import { pendenciasDoLinkPublico, type Pendencia } from '@/domain/catalogo/pendencias';
import { espacos, faixasPreco, pacotes, tiposEvento, turnos } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';

/** O que falta para o link público funcionar (memoizado por requisição). */
export const carregarPendencias = cache(async (usuarioId: string): Promise<Pendencia[]> => {
  return comUsuario(usuarioId, async (tx) => {
    const [listaPacotes, qtdFaixas, listaTipos, listaTurnos, listaEspacos] = await Promise.all([
      tx
        .select({
          id: pacotes.id,
          ativo: pacotes.ativo,
          modeloPreco: pacotes.modeloPreco,
          precoPessoaCentavos: pacotes.precoPessoaCentavos,
          valorExcedenteCentavos: pacotes.valorExcedenteCentavos,
        })
        .from(pacotes),
      tx
        .select({ pacoteId: faixasPreco.pacoteId, n: count() })
        .from(faixasPreco)
        .groupBy(faixasPreco.pacoteId),
      tx
        .select({ ativo: tiposEvento.ativo })
        .from(tiposEvento)
        .where(eq(tiposEvento.ativo, true))
        .limit(1),
      tx.select({ ativo: turnos.ativo }).from(turnos).where(eq(turnos.ativo, true)).limit(1),
      tx.select({ ativo: espacos.ativo }).from(espacos).where(eq(espacos.ativo, true)).limit(1),
    ]);
    const faixasPorPacote = new Map(qtdFaixas.map((f) => [f.pacoteId, f.n]));
    return pendenciasDoLinkPublico({
      pacotes: listaPacotes.map((p) => ({
        ...p,
        quantidadeFaixas: faixasPorPacote.get(p.id) ?? 0,
      })),
      tiposEvento: listaTipos,
      turnos: listaTurnos,
      espacos: listaEspacos,
    });
  });
});
