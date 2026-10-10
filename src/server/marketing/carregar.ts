import 'server-only';
import { sql } from 'drizzle-orm';
import { unstable_cache, unstable_noStore } from 'next/cache';
import { hojeNoFuso } from '@/domain/dates';
import {
  montarExemploSimulador,
  type ExemploSimulador,
  type PlanoVitrine,
} from '@/domain/marketing';
import { contextoDoModelo, MODELOS } from '@/domain/modelos';
import { camelizar } from '@/server/catalogo/montar-contexto';
import { comAnon as comAnonPadrao } from '@/server/db/anon';
import type { ComAnon } from '@/server/publico/carregar';
import { TAG_PLANOS } from './cache';
import { codigoDoErro, logar } from '@/server/log';

export { TAG_PLANOS };

/*
 * Leituras da landing (Etapa 9.6). Preços só por publico.planos_vitrine (anon); nada de valor
 * fixo no código. Cache de 5 min com a tag TAG_PLANOS (quem mudar plano invalida).
 */

export type PrecosVitrine = { planos: PlanoVitrine[] };

type JsonVitrine = { planos: PlanoVitrine[] };

export async function lerPrecosVitrine(comAnon: ComAnon = comAnonPadrao): Promise<PrecosVitrine> {
  const [linha] = await comAnon((tx) =>
    tx.execute<{ v: unknown }>(sql`select publico.planos_vitrine() as v`),
  );
  const j = camelizar<JsonVitrine>(linha?.v ?? { planos: [] });
  return { planos: j.planos };
}

const lerEmCache = unstable_cache(async () => lerPrecosVitrine(), ['planos-vitrine'], {
  tags: [TAG_PLANOS],
  revalidate: 300,
});

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
    return await lerEmCache();
  } catch (e) {
    logar('erro', 'landing.planos_vitrine', { codigo: codigoDoErro(e) });
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
