import 'server-only';
import { sql } from 'drizzle-orm';
import { unstable_cache, unstable_noStore } from 'next/cache';
import { hojeNoFuso } from '@/domain/dates';
import {
  montarExemploSimulador,
  type CupomFundador,
  type ExemploSimulador,
  type PlanoVitrine,
} from '@/domain/marketing';
import { contextoDoModelo, MODELOS } from '@/domain/modelos';
import { camelizar } from '@/server/catalogo/montar-contexto';
import { comAnon as comAnonPadrao } from '@/server/db/anon';
import type { ComAnon } from '@/server/publico/carregar';
import { TAG_PLANOS } from './cache';

export { TAG_PLANOS };

/*
 * Leituras da landing (Etapa 9.6). Preços só por publico.planos_vitrine (anon); nada de valor
 * fixo no código. Cache de 5 min com a tag TAG_PLANOS (quem mudar plano ou cupom invalida).
 */

export type PrecosVitrine = { planos: PlanoVitrine[]; fundador: CupomFundador | null };

type JsonVitrine = {
  planos: PlanoVitrine[];
  fundador: (Omit<CupomFundador, 'validoAte'> & { validoAte: string | null }) | null;
};

export async function lerPrecosVitrine(comAnon: ComAnon = comAnonPadrao): Promise<PrecosVitrine> {
  const [linha] = await comAnon((tx) =>
    tx.execute<{ v: unknown }>(sql`select publico.planos_vitrine() as v`),
  );
  const j = camelizar<JsonVitrine>(linha?.v ?? { planos: [], fundador: null });
  return {
    planos: j.planos,
    fundador: j.fundador
      ? { ...j.fundador, validoAte: j.fundador.validoAte ? new Date(j.fundador.validoAte) : null }
      : null,
  };
}

const lerEmCache = unstable_cache(
  async () => {
    const p = await lerPrecosVitrine();
    // Date não sobrevive à serialização do cache: guarda o ISO e refaz na saída
    return {
      ...p,
      fundador: p.fundador && {
        ...p.fundador,
        validoAte: p.fundador.validoAte?.toISOString() ?? null,
      },
    };
  },
  ['planos-vitrine'],
  { tags: [TAG_PLANOS], revalidate: 300 },
);

/**
 * Preços da landing; null se a leitura falhar (a página mostra os cartões sem preço e o
 * WhatsApp de vendas). A falha nunca fica guardada (Etapa 9B, B.0):
 * - o `unstable_cache` não guarda exceção (a próxima chamada lê de novo);
 * - a PÁGINA também não: `unstable_noStore()` tira esta renderização do cache estático. No build
 *   (ex.: migration ainda não aplicada) a rota vira dinâmica e cada requisição tenta de novo; numa
 *   revalidação em segundo plano a página antiga (com preço) continua sendo servida.
 */
export async function carregarPrecosVitrine(): Promise<PrecosVitrine | null> {
  try {
    const p = await lerEmCache();
    return {
      planos: p.planos,
      fundador: p.fundador && {
        ...p.fundador,
        validoAte: p.fundador.validoAte ? new Date(p.fundador.validoAte) : null,
      },
    };
  } catch (e) {
    console.error(
      '[landing] falha ao ler planos_vitrine',
      (e as { code?: string }).code ?? 'sem-codigo',
    );
  }
  // Fora do try: no build e na revalidação o noStore interrompe a renderização de propósito.
  unstable_noStore();
  return null;
}

/** Exemplo do simulador: o catálogo do modelo infantil (preços fictícios), com "hoje" de SP. */
export function exemploDoSimulador(agora = new Date()): ExemploSimulador {
  return montarExemploSimulador(contextoDoModelo(MODELOS.infantil), hojeNoFuso(undefined, agora));
}

export type EventoLanding = 'visita' | 'clicou_teste';

export async function contarEventoLanding(
  evento: EventoLanding,
  comAnon: ComAnon = comAnonPadrao,
): Promise<void> {
  await comAnon((tx) => tx.execute(sql`select publico.landing_contar(${evento})`));
}
