import 'server-only';
import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { hojeNoFuso } from '@/domain/dates';
import type { ContextoPreco, Id } from '@/domain/preco';
import { montarVitrine, type ExtrasPacote, type VitrinePublica } from '@/domain/publico';
import { slugValido } from '@/domain/slug';
import { urlPublicaMidia } from '@/lib/midia';
import { camelizar, montarContexto, type LinhasCatalogo } from '@/server/catalogo/montar-contexto';
import { comAnon as comAnonPadrao } from '@/server/db/anon';
import type { Tx } from '@/server/db/tenant';
import { tagDoBuffet } from './cache';

/*
 * Leituras do link público. Só pelas funções do schema `publico`, como anon (comAnon).
 * Vitrine e catálogo ficam em cache por slug (tag `buffet:{slug}`, invalidada pelas actions de
 * configuração). Disponibilidade e preço NUNCA ficam em cache.
 */

export type ComAnon = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

export type BuffetPublico = {
  nome: string;
  slug: string;
  sobre: string | null;
  logoUrl: string | null;
  capaUrl: string | null;
  corMarca: string | null;
  whatsappE164: string | null;
  cidade: string | null;
  uf: string | null;
  fuso: string;
  suspenso: boolean;
};

type LinhaBuffet = {
  nome: string;
  slug: string;
  sobre: string | null;
  logo_path: string | null;
  capa_path: string | null;
  cor_marca: string | null;
  whatsapp_e164: string | null;
  cidade: string | null;
  uf: string | null;
  fuso: string;
  suspenso: boolean;
};

export async function lerBuffet(slug: string, comAnon: ComAnon = comAnonPadrao) {
  const [linha] = await comAnon((tx) =>
    tx.execute<LinhaBuffet>(sql`select * from publico.buffet(${slug})`),
  );
  if (!linha) return null;
  return {
    nome: linha.nome,
    slug: linha.slug,
    sobre: linha.sobre,
    logoUrl: urlPublicaMidia(linha.logo_path),
    capaUrl: urlPublicaMidia(linha.capa_path),
    corMarca: linha.cor_marca,
    whatsappE164: linha.whatsapp_e164,
    cidade: linha.cidade,
    uf: linha.uf,
    fuso: linha.fuso,
    suspenso: linha.suspenso,
  } satisfies BuffetPublico;
}

export async function lerSlugAtual(slug: string, comAnon: ComAnon = comAnonPadrao) {
  const [linha] = await comAnon((tx) =>
    tx.execute<{ atual: string | null }>(sql`select publico.slug_atual(${slug}) as atual`),
  );
  return linha?.atual ?? null;
}

export type ContextoPublico = {
  ctx: ContextoPreco;
  extras: Record<Id, ExtrasPacote>;
  fuso: string;
  prazoPreReservaHoras: number;
  cancelamentoTexto: string | null;
};

type JsonContexto = {
  fuso: string;
  regras: LinhasCatalogo['regras'] & {
    prazoPreReservaHoras: number;
    cancelamentoTexto: string | null;
  };
  tiposEvento: LinhasCatalogo['tiposEvento'];
  espacos: LinhasCatalogo['espacos'];
  turnos: LinhasCatalogo['turnos'];
  ajustesDia: LinhasCatalogo['ajustesDia'];
  feriados: LinhasCatalogo['feriados'];
  faixasIdade: LinhasCatalogo['faixasIdade'];
  pacotes: (LinhasCatalogo['pacotes'][number] & { descricao: string | null; fotos: string[] })[];
  faixasPreco: LinhasCatalogo['faixasPreco'];
  secoesCardapio: LinhasCatalogo['secoesCardapio'];
  pacoteTiposEvento: LinhasCatalogo['pacoteTiposEvento'];
  opcionais: LinhasCatalogo['opcionais'];
  opcionalPacotes: LinhasCatalogo['opcionalPacotes'];
  opcionalTiposEvento: LinhasCatalogo['opcionalTiposEvento'];
  faixasDeslocamento: LinhasCatalogo['faixasDeslocamento'];
};

/**
 * ContextoPreco do buffet (o MESMO mapper do painel) + extras da vitrine. Null se o slug não
 * existir ou estiver suspenso. Contém preços: fica no servidor.
 */
export async function lerContextoPublico(
  slug: string,
  comAnon: ComAnon = comAnonPadrao,
): Promise<ContextoPublico | null> {
  try {
    const [linha] = await comAnon((tx) =>
      tx.execute<{ c: unknown }>(sql`select publico.contexto_preco(${slug}) as c`),
    );
    const j = camelizar<JsonContexto>(linha?.c);
    return {
      ctx: montarContexto(j),
      extras: Object.fromEntries(
        j.pacotes.map((p) => [p.id, { descricao: p.descricao, fotos: p.fotos ?? [] }]),
      ),
      fuso: j.fuso,
      prazoPreReservaHoras: j.regras.prazoPreReservaHoras,
      cancelamentoTexto: j.regras.cancelamentoTexto,
    };
  } catch (erro) {
    const mensagem =
      (erro as { message?: string; cause?: { message?: string } }).cause?.message ??
      (erro as { message?: string }).message;
    if (mensagem === 'PUBLICO_NAO_ENCONTRADO' || mensagem === 'PUBLICO_SUSPENSO') return null;
    throw erro;
  }
}

// --- Versões em cache (só dentro do Next) ------------------------------------

const OPCOES_CACHE = (slug: string) => ({ tags: [tagDoBuffet(slug)], revalidate: 300 });

/** Buffet do slug (cache por slug + memo por requisição). Slug inválido = null sem consulta. */
export const carregarBuffet = cache(async (slug: string): Promise<BuffetPublico | null> => {
  if (!slugValido(slug)) return null;
  return unstable_cache(() => lerBuffet(slug), ['publico-buffet', slug], OPCOES_CACHE(slug))();
});

export const carregarSlugAtual = cache(async (slug: string) =>
  slugValido(slug) ? lerSlugAtual(slug) : null,
);

export const carregarContextoPublico = cache(
  async (slug: string): Promise<ContextoPublico | null> => {
    if (!slugValido(slug)) return null;
    return unstable_cache(
      () => lerContextoPublico(slug),
      ['publico-contexto', slug],
      OPCOES_CACHE(slug),
    )();
  },
);

/** Vitrine (sem tabelas de preço) + "hoje" no fuso do buffet (nunca em cache). */
export async function carregarVitrine(
  slug: string,
): Promise<{ vitrine: VitrinePublica; contexto: ContextoPublico } | null> {
  const contexto = await carregarContextoPublico(slug);
  if (!contexto) return null;
  const hoje = hojeNoFuso(contexto.fuso);
  return { vitrine: montarVitrine(contexto.ctx, contexto.extras, hoje), contexto };
}
