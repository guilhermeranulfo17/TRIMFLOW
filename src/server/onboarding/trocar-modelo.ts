import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { modeloDaChave, type ChaveModelo } from '@/domain/modelos';
import { auditar } from '@/server/actions/empresa/comum';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { gravarModelo } from '@/server/catalogo/gravar-modelo';
import { empresas } from '@/server/db/schema';
import type { Tx } from '@/server/db/tenant';
import { catalogoSoDeExemplo } from './carregar';

/** Tabelas do catálogo, das filhas para as mães (a troca de modelo apaga nesta ordem). */
const TABELAS_CATALOGO = [
  'opcional_tipos_evento',
  'opcional_pacotes',
  'pacote_tipos_evento',
  'secoes_cardapio',
  'faixas_preco',
  'faixas_idade',
  'pacotes',
  'opcionais',
  'tipos_evento',
  'turnos',
  'espacos',
  'ajustes_dia',
  'faixas_deslocamento',
] as const;

/**
 * Passo 1 do onboarding (Fase 6): troca o modelo de exemplo (ex.: infantil por casamento e 15
 * anos). Só enquanto o catálogo é só o exemplo (`catalogoSoDeExemplo`: nenhum preço confirmado,
 * orçamento, reserva ou bloqueio e onboarding não concluído); senão lança MODELO_EM_USO. Na
 * transação do dono (RLS): apaga o catálogo de exemplo, troca o segmento, audita e grava o
 * modelo novo. Nunca apaga nada que o dono tenha confirmado. Devolve o nome do modelo.
 */
export async function trocarModelo(
  tx: Tx,
  usuario: UsuarioAtual,
  chave: ChaveModelo,
): Promise<string> {
  const empresaId = usuario.empresa.id;
  const modelo = modeloDaChave(chave);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`catalogo:${empresaId}`}))`);
  const livre = await catalogoSoDeExemplo(tx, empresaId);
  if (!livre.ok) throw new Error('MODELO_EM_USO');
  for (const t of TABELAS_CATALOGO) {
    await tx.execute(
      sql`delete from ${sql.identifier('public')}.${sql.identifier(t)} where empresa_id = ${empresaId}`,
    );
  }
  await tx.update(empresas).set({ segmento: modelo.segmento }).where(eq(empresas.id, empresaId));
  await auditar(tx, usuario, 'onboarding.modelo_trocado', 'empresa', empresaId, {
    antes: { segmento: livre.segmento },
    depois: { segmento: modelo.segmento, modelo: chave },
  });
  const r = await gravarModelo((_id, fn) => fn(tx), usuario.id, empresaId, modelo);
  if (!r.ok) throw new Error('MODELO_EM_USO');
  return modelo.nome;
}
