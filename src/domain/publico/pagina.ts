import { formatBRL } from '../money';
import type { VitrinePublica } from './vitrine';

/*
 * Página pública do buffet (Etapa 9.5): estilo, limites, sugestões do segmento, perguntas
 * automáticas (dos dados reais), endereço/mapa e dados estruturados. Limites e diferenciais
 * válidos existem também no SQL (_limite_pagina, _diferenciais_validos): mudou um, mude o outro.
 */

export const ESTILOS = ['festivo', 'elegante', 'limpo'] as const;
export type EstiloPagina = (typeof ESTILOS)[number];
export type Segmento = 'infantil' | 'eventos' | 'domicilio';

export const ROTULO_ESTILO: Record<EstiloPagina, { nome: string; descricao: string }> = {
  festivo: {
    nome: 'Festivo',
    descricao: 'Títulos arredondados, cantos suaves e formas coloridas.',
  },
  elegante: { nome: 'Elegante', descricao: 'Títulos com serifa, cantos retos e filetes finos.' },
  limpo: { nome: 'Limpo', descricao: 'Visual direto, tipografia simples e sem enfeites.' },
};

const ESTILO_DO_SEGMENTO: Record<Segmento, EstiloPagina> = {
  infantil: 'festivo',
  eventos: 'elegante',
  domicilio: 'limpo',
};

export function estiloValido(v: unknown): v is EstiloPagina {
  return typeof v === 'string' && (ESTILOS as readonly string[]).includes(v);
}

/** Estilo escolhido pelo dono ou, sem escolha, o padrão do segmento. */
export function estiloEfetivo(estilo: string | null | undefined, segmento: Segmento): EstiloPagina {
  return estiloValido(estilo) ? estilo : ESTILO_DO_SEGMENTO[segmento];
}

export const LIMITES_PAGINA = {
  slogan: 80,
  bairro: 80,
  diferenciais: 8,
  diferencialMin: 2,
  diferencialMax: 40,
  galeria: 12,
  altFoto: 140,
  depoimentos: 6,
  depoimentoNome: 60,
  depoimentoTipo: 60,
  depoimentoTextoMin: 10,
  depoimentoTexto: 400,
  perguntas: 8,
  perguntaMin: 5,
  pergunta: 140,
  resposta: 600,
} as const;

/** Mesma regra do SQL (_diferenciais_validos): até 8, 2 a 40 caracteres, sem repetir. */
export function diferenciaisValidos(lista: string[]): boolean {
  const L = LIMITES_PAGINA;
  if (lista.length > L.diferenciais) return false;
  const vistos = new Set<string>();
  for (const d of lista) {
    const t = d.trim();
    if (t.length < L.diferencialMin || t.length > L.diferencialMax) return false;
    const chave = t.toLowerCase();
    if (vistos.has(chave)) return false;
    vistos.add(chave);
  }
  return true;
}

const SUGESTOES_SLOGAN: Record<Segmento, string[]> = {
  infantil: [
    'A festa que as crianças vão lembrar para sempre',
    'Diversão para os pequenos, tranquilidade para os pais',
    'Seu filho brinca, você aproveita a festa',
  ],
  eventos: [
    'O seu grande dia, cuidado em cada detalhe',
    'Eventos inesquecíveis, do brinde ao último convidado',
    'Elegância e sabor para celebrar quem você ama',
  ],
  domicilio: [
    'A festa vai até você, com tudo pronto',
    'Buffet completo no conforto da sua casa',
    'Você recebe, a gente cuida do resto',
  ],
};

const SUGESTOES_DIFERENCIAIS: Record<Segmento, string[]> = {
  infantil: [
    'Espaço próprio',
    'Monitores',
    'Cardápio infantil',
    'Brinquedão',
    'Estacionamento',
    'Acessibilidade',
    'Área para bebês',
    'Decoração inclusa',
  ],
  eventos: [
    'Espaço climatizado',
    'Estacionamento com manobrista',
    'Cerimonial',
    'Pista de dança',
    'Bar de drinks',
    'Acessibilidade',
    'Gerador próprio',
    'Suíte para a noiva',
  ],
  domicilio: [
    'Montagem e desmontagem',
    'Garçons uniformizados',
    'Louças e utensílios',
    'Cardápio personalizado',
    'Atendemos a região',
    'Equipe treinada',
  ],
};

export function sugestoesSlogan(segmento: Segmento): string[] {
  return SUGESTOES_SLOGAN[segmento];
}

/** Sugestões do segmento que o dono ainda não usou. */
export function sugestoesDiferenciais(segmento: Segmento, usados: string[] = []): string[] {
  const ja = new Set(usados.map((u) => u.trim().toLowerCase()));
  return SUGESTOES_DIFERENCIAIS[segmento].filter((s) => !ja.has(s.toLowerCase()));
}

export type Pergunta = { pergunta: string; resposta: string };

function horas(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!m) return `${h} ${h === 1 ? 'hora' : 'horas'}`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function lista(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/**
 * Perguntas frequentes geradas dos dados reais do buffet (nunca inventa: pergunta sem dado
 * não aparece). Vêm antes das perguntas do dono.
 */
export function perguntasAutomaticas(
  v: Pick<
    VitrinePublica,
    'modoPreco' | 'aPartirDeCentavos' | 'antecedenciaMinDias' | 'pacotes' | 'opcionais'
  >,
  o: { prazoPreReservaHoras?: number | null } = {},
): Pergunta[] {
  const r: Pergunta[] = [];
  const pacotes = v.pacotes;
  if (pacotes.length > 0) {
    const duracoes = [...new Set(pacotes.map((p) => p.duracaoInclusaMin))].sort((a, b) => a - b);
    r.push({
      pergunta: 'Quanto tempo dura a festa?',
      resposta:
        duracoes.length === 1
          ? `A festa tem ${horas(duracoes[0]!)} de duração.`
          : `De ${horas(duracoes[0]!)} a ${horas(duracoes[duracoes.length - 1]!)}, conforme o pacote.`,
    });
    const min = Math.min(...pacotes.map((p) => p.minConvidados));
    const maximos = pacotes.map((p) => p.maxConvidados);
    const max = maximos.some((m) => m === null) ? null : Math.max(...(maximos as number[]));
    r.push({
      pergunta: 'Quantos convidados posso ter?',
      resposta:
        max === null
          ? `A partir de ${min} convidados.`
          : `De ${min} a ${max} convidados, conforme o pacote.`,
    });
    const secoes = [
      ...new Set(pacotes.flatMap((p) => p.secoes.filter((s) => s.itens.length).map((s) => s.nome))),
    ];
    if (secoes.length > 0) {
      r.push({
        pergunta: 'O que está incluso?',
        resposta: `Os pacotes incluem ${lista(secoes.map((s) => s.toLowerCase()))}. Veja os detalhes de cada pacote acima.`,
      });
    }
  }
  if (v.modoPreco !== 'apos_contato' && v.aPartirDeCentavos !== null) {
    r.push({
      pergunta: 'Quanto custa?',
      resposta: `As festas começam em ${formatBRL(v.aPartirDeCentavos)}. Monte o orçamento e veja o valor exato na hora, sem compromisso.`,
    });
  }
  if (v.opcionais.length > 0) {
    r.push({
      pergunta: 'Posso adicionar itens extras?',
      resposta: `Sim: ${lista(v.opcionais.slice(0, 4).map((o) => o.nome.toLowerCase()))}${v.opcionais.length > 4 ? ' e outros' : ''}. Escolha no orçamento.`,
    });
  }
  const prazo = o.prazoPreReservaHoras;
  r.push({
    pergunta: 'Como faço para reservar a data?',
    resposta:
      `Monte o orçamento, escolha a data e peça a pré-reserva` +
      (prazo
        ? `: a data fica guardada por ${prazo >= 24 && prazo % 24 === 0 ? `${prazo / 24} ${prazo === 24 ? 'dia' : 'dias'}` : `${prazo} horas`}`
        : '') +
      ` enquanto a equipe confirma com você.` +
      (v.antecedenciaMinDias > 0
        ? ` Reservas com pelo menos ${v.antecedenciaMinDias} ${v.antecedenciaMinDias === 1 ? 'dia' : 'dias'} de antecedência.`
        : ''),
  });
  return r;
}

/** Endereço que aparece em "Onde fica": completo só se o dono marcar; senão bairro e cidade. */
export function localDaPagina(b: {
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}): string | null {
  const cidade = b.cidade ? `${b.cidade}${b.uf ? ` - ${b.uf}` : ''}` : null;
  if (b.endereco) return [b.endereco, cidade].filter(Boolean).join(', ');
  const partes = [b.bairro, cidade].filter(Boolean);
  return partes.length ? partes.join(', ') : null;
}

/** Link "Abrir no mapa" (busca no Google Maps, sem mapa incorporado). */
export function linkMapa(nome: string, local: string): string {
  const q = encodeURIComponent(`${nome}, ${local}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** Texto alternativo padrão de uma foto da galeria. */
export function altPadrao(nomeBuffet: string, posicao: number): string {
  return `Foto ${posicao} do espaço de ${nomeBuffet}`;
}

/**
 * JSON-LD LocalBusiness: só dados reais (nome, cidade, imagem, telefone, endereço quando
 * público). Nunca nota, avaliação ou contagem de depoimentos.
 */
export function jsonLdNegocio(b: {
  nome: string;
  url: string;
  descricao: string | null;
  imagem: string | null;
  telefoneE164: string | null;
  cidade: string | null;
  uf: string | null;
  bairro: string | null;
  endereco: string | null;
}): Record<string, unknown> {
  const endereco: Record<string, string> = { '@type': 'PostalAddress', addressCountry: 'BR' };
  if (b.cidade) endereco.addressLocality = b.cidade;
  if (b.uf) endereco.addressRegion = b.uf;
  if (b.endereco) endereco.streetAddress = b.endereco;
  else if (b.bairro) endereco.streetAddress = b.bairro;
  const j: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: b.nome,
    url: b.url,
    address: endereco,
  };
  if (b.descricao) j.description = b.descricao;
  if (b.imagem) j.image = b.imagem;
  if (b.telefoneE164) j.telephone = b.telefoneE164;
  return j;
}

/** JSON-LD seguro para <script>: escapa "<" para não fechar a tag. */
export function serializarJsonLd(j: Record<string, unknown>): string {
  return JSON.stringify(j).replace(/</g, '\\u003c');
}
