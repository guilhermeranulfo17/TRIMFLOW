import 'server-only';
import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { hojeNoFuso } from '@/domain/dates';
import { capaPequenaDe } from '@/domain/imagem';
import type { ContextoPreco, Id } from '@/domain/preco';
import type { TextosComerciais } from '@/domain/proposta';
import { montarVitrine, type ExtrasPacote, type VitrinePublica } from '@/domain/publico';
import { estiloEfetivo, type EstiloPagina, type Segmento } from '@/domain/publico/pagina';
import { slugValido } from '@/domain/slug';
import { urlPublicaMidia } from '@/lib/midia';
import { camelizar, montarContexto, type LinhasCatalogo } from '@/server/catalogo/montar-contexto';
import { comAnon as comAnonPadrao } from '@/server/db/anon';
import type { Tx } from '@/server/db/tenant';
import { tagDoBuffet } from './cache';

/*
 * Leituras do link público. Só pelas funções do schema `publico`, como anon (comAnon).
 * Catálogo (contexto + vitrine) fica em cache por slug (tag `buffet:{slug}`, invalidada pelas actions de
 * configuração). Disponibilidade e preço NUNCA ficam em cache.
 */

export type ComAnon = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

export type BuffetPublico = {
  nome: string;
  slug: string;
  sobre: string | null;
  logoUrl: string | null;
  capaUrl: string | null;
  /** Versão de 960 px da capa (celular); null em capas antigas, de uma largura só. */
  capaUrl960: string | null;
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
    capaUrl960: urlPublicaMidia(capaPequenaDe(linha.capa_path)),
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
  /** textos comerciais congelados em cada versão da proposta */
  textos: TextosComerciais;
  /** texto de abertura (com variáveis) por tipo de festa */
  aberturaPorTipo: Record<Id, string | null>;
};

type JsonContexto = {
  fuso: string;
  regras: LinhasCatalogo['regras'] & {
    prazoPreReservaHoras: number;
    cancelamentoTexto: string | null;
    condicoesTexto?: string;
    formasPagamento?: string[];
    naoInclusoTexto?: string;
    alteracaoConvidadosTexto?: string;
  };
  tiposEvento: (LinhasCatalogo['tiposEvento'][number] & { textoAbertura?: string | null })[];
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
  o: { suspensa?: boolean } = {},
): Promise<ContextoPublico | null> {
  try {
    // empresa suspensa: só a vitrine (contexto_vitrine); o wizard nunca usa esta variante
    const [linha] = await comAnon((tx) =>
      tx.execute<{ c: unknown }>(
        o.suspensa
          ? sql`select publico.contexto_vitrine(${slug}) as c`
          : sql`select publico.contexto_preco(${slug}) as c`,
      ),
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
      textos: {
        condicoes: j.regras.condicoesTexto ?? '',
        formasPagamento: j.regras.formasPagamento ?? [],
        naoIncluso: j.regras.naoInclusoTexto ?? '',
        cancelamento: j.regras.cancelamentoTexto ?? '',
        alteracaoConvidados: j.regras.alteracaoConvidadosTexto ?? '',
      },
      aberturaPorTipo: Object.fromEntries(
        j.tiposEvento.map((t) => [t.id, t.textoAbertura ?? null]),
      ),
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

// 60 s é a rede de segurança: toda ação do dono que muda o link já invalida a tag na hora.
const OPCOES_CACHE = (slug: string) => ({ tags: [tagDoBuffet(slug)], revalidate: 60 });

/**
 * Buffet do slug (memo por requisição). Sem cache entre requisições: é uma linha só e o
 * plano (suspenso) precisa valer na hora. Slug inválido = null sem consulta.
 */
export const carregarBuffet = cache(async (slug: string): Promise<BuffetPublico | null> =>
  slugValido(slug) ? lerBuffet(slug) : null,
);

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

/**
 * Vitrine (sem tabelas de preço) + "hoje" no fuso do buffet (nunca em cache). Empresa suspensa
 * (Etapa 9A): a página mostra só a vitrine e o WhatsApp, sem "Montar meu orçamento".
 */
export async function carregarVitrine(
  slug: string,
  o: { suspensa?: boolean } = {},
): Promise<{ vitrine: VitrinePublica; contexto: ContextoPublico } | null> {
  const contexto = o.suspensa
    ? slugValido(slug)
      ? await unstable_cache(
          () => lerContextoPublico(slug, comAnonPadrao, { suspensa: true }),
          ['publico-contexto-vitrine', slug],
          OPCOES_CACHE(slug),
        )()
      : null
    : await carregarContextoPublico(slug);
  if (!contexto) return null;
  const hoje = hojeNoFuso(contexto.fuso);
  return { vitrine: montarVitrine(contexto.ctx, contexto.extras, hoje), contexto };
}

export type EstadoOrcamento = {
  status: string;
  passoAtual: number;
  rascunho: unknown;
  ehTeste: boolean;
  numero: number;
};

/** Orçamento em andamento do cookie (retomar o wizard). Nunca em cache. */
export async function lerEstadoOrcamento(
  slug: string,
  token: string,
  comAnon: ComAnon = comAnonPadrao,
): Promise<EstadoOrcamento | null> {
  const [linha] = await comAnon((tx) =>
    tx.execute<{ e: Record<string, unknown> | null }>(
      sql`select publico.estado_orcamento(${slug}, ${token}) as e`,
    ),
  );
  return linha?.e ? camelizar<EstadoOrcamento>(linha.e) : null;
}

// --- Página pública (Etapa 9.5) ----------------------------------------------

export type FotoPublica = {
  id: Id;
  url640: string;
  url1280: string;
  largura: number;
  altura: number;
  blur: string | null;
  alt: string | null;
};

export type PaginaPublica = {
  segmento: Segmento;
  estilo: EstiloPagina;
  slogan: string | null;
  diferenciais: string[];
  bairro: string | null;
  /** só quando o dono marca "mostrar endereço completo" */
  endereco: string | null;
  galeria: FotoPublica[];
  depoimentos: { id: Id; nome: string; tipoFesta: string | null; texto: string }[];
  perguntas: { id: Id; pergunta: string; resposta: string }[];
};

type JsonPagina = {
  segmento: Segmento;
  slogan: string | null;
  estilo: string | null;
  diferenciais: string[] | null;
  bairro: string | null;
  endereco: string | null;
  galeria: {
    id: Id;
    caminho640: string;
    caminho1280: string;
    largura: number;
    altura: number;
    blur: string | null;
    alt: string | null;
  }[];
  depoimentos: PaginaPublica['depoimentos'];
  perguntas: PaginaPublica['perguntas'];
};

/** Conteúdo da página (publico.pagina). Null se o slug não existir. Nada de preço aqui. */
export async function lerPagina(
  slug: string,
  comAnon: ComAnon = comAnonPadrao,
): Promise<PaginaPublica | null> {
  const [linha] = await comAnon((tx) =>
    tx.execute<{ p: unknown }>(sql`select publico.pagina(${slug}) as p`),
  );
  if (!linha?.p) return null;
  const j = camelizar<JsonPagina>(linha.p);
  return {
    segmento: j.segmento,
    estilo: estiloEfetivo(j.estilo, j.segmento),
    slogan: j.slogan,
    diferenciais: j.diferenciais ?? [],
    bairro: j.bairro,
    endereco: j.endereco,
    galeria: j.galeria.map((f) => ({
      id: f.id,
      url640: urlPublicaMidia(f.caminho640)!,
      url1280: urlPublicaMidia(f.caminho1280)!,
      largura: f.largura,
      altura: f.altura,
      blur: f.blur,
      alt: f.alt,
    })),
    depoimentos: j.depoimentos,
    perguntas: j.perguntas,
  };
}

/**
 * Página do slug. Em cache pela tag do buffet (toda ação do editor invalida), menos no modo
 * teste e na prévia do editor: o dono vê na hora o que acabou de salvar.
 */
export const carregarPagina = cache(
  async (slug: string, semCache = false): Promise<PaginaPublica | null> => {
    if (!slugValido(slug)) return null;
    if (semCache) return lerPagina(slug);
    return unstable_cache(() => lerPagina(slug), ['publico-pagina', slug], OPCOES_CACHE(slug))();
  },
);
