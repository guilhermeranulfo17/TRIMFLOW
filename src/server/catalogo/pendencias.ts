import 'server-only';
import { and, count, eq, isNotNull, sql } from 'drizzle-orm';
import { cache } from 'react';
import { pendenciasDoLinkPublico, type Pendencia } from '@/domain/catalogo/pendencias';
import {
  espacos,
  faixasPreco,
  opcionais,
  pacotes,
  regrasComerciais,
  tiposEvento,
  turnos,
} from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';

/** O que falta para o link público funcionar (memoizado por requisição). */
export const carregarPendencias = cache(async (usuarioId: string): Promise<Pendencia[]> => {
  return comUsuario(usuarioId, async (tx) => {
    const [listaPacotes, qtdFaixas, listaTipos, listaTurnos, listaEspacos, regras, itens] =
      await Promise.all([
        tx
          .select({
            id: pacotes.id,
            ativo: pacotes.ativo,
            modeloPreco: pacotes.modeloPreco,
            precoPessoaCentavos: pacotes.precoPessoaCentavos,
            valorExcedenteCentavos: pacotes.valorExcedenteCentavos,
            precoConfirmadoEm: pacotes.precoConfirmadoEm,
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
        // §96: jeito de vender e item vendável sem pacote (ativo, preço confirmado, sem "compatível")
        tx
          .select({
            modo: regrasComerciais.modoVenda,
            faixasFesta: regrasComerciais.faixasFestaPorPessoa,
          })
          .from(regrasComerciais)
          .limit(1),
        tx
          .select({ id: opcionais.id })
          .from(opcionais)
          .where(
            and(
              eq(opcionais.ativo, true),
              isNotNull(opcionais.precoConfirmadoEm),
              sql`not exists (select 1 from public.opcional_pacotes v
                where v.opcional_id = ${opcionais.id} and v.relacao = 'compativel')`,
            ),
          )
          .limit(1),
      ]);
    const faixasPorPacote = new Map(qtdFaixas.map((f) => [f.pacoteId, f.n]));
    return pendenciasDoLinkPublico({
      pacotes: listaPacotes.map(({ precoConfirmadoEm, ...p }) => ({
        ...p,
        quantidadeFaixas: faixasPorPacote.get(p.id) ?? 0,
        precoConfirmado: precoConfirmadoEm !== null,
      })),
      tiposEvento: listaTipos,
      turnos: listaTurnos,
      espacos: listaEspacos,
      venda: {
        modo: regras[0]?.modo ?? 'pacotes',
        itensComPreco: itens.length > 0,
        festaComPreco: (regras[0]?.faixasFesta.length ?? 0) > 0,
      },
    });
  });
});
