import { dataPorExtenso, formatData } from '../dates';
import { formatBRL } from '../money';
import { formatBp } from '../percent';
import { formatPhoneBR } from '../phone';
import type { ContextoPreco, Id, ResultadoOrcamento } from '../preco';
import { coresDaMarca, type CoresMarca } from '../publico/cor';
import { AVISO_DESLOCAMENTO } from '../publico/previa';
import type { Escolhas } from '../publico/tipos';
import { mascaraCnpj } from '../validacao/cnpj';
import { preencherAbertura } from './abertura';
import { numeroProposta } from './arquivo';
import { estadoValidade, type EstadoValidade } from './validade';

// ---------------------------------------------------------------------------
// Conteúdo congelado na conclusão de cada versão (orcamentos.conteudo)
// ---------------------------------------------------------------------------

/**
 * Tudo o que a proposta mostra e não está no resultado do motor. Copiado no momento da
 * conclusão: mudar o catálogo ou as regras depois NUNCA altera uma versão já enviada.
 */
export type ConteudoCongelado = {
  formato: 1;
  pacote: {
    nome: string;
    duracaoInclusaMin: number;
    secoes: { nome: string; itens: string[] }[];
  } | null;
  convidados: { adultos: number; criancas: { rotulo: string; quantidade: number }[] };
  espaco: { nome: string; noLocalDoCliente: boolean; localCliente: string | null } | null;
  abertura: string | null;
  textos: {
    condicoes: string;
    formasPagamento: string[];
    naoIncluso: string;
    cancelamento: string;
    alteracaoConvidados: string;
    sinalBp: number;
  };
};

export type TextosComerciais = Omit<ConteudoCongelado['textos'], 'sinalBp'>;

export function congelarConteudo(d: {
  ctx: ContextoPreco;
  escolhas: Escolhas;
  textos: TextosComerciais;
  /** texto de abertura do tipo de festa (com variáveis) */
  aberturaModelo: string | null;
  clienteNome: string;
  buffetNome: string;
}): ConteudoCongelado {
  const { ctx, escolhas: e } = d;
  const pacote = ctx.pacotes.find((p) => p.id === e.pacoteId) ?? null;
  const espacosAtivos = ctx.espacos.filter((x) => x.ativo);
  const espaco =
    (espacosAtivos.length === 1
      ? espacosAtivos[0]
      : espacosAtivos.find((x) => x.id === e.espacoId)) ?? null;
  const tipo = ctx.tiposEvento.find((t) => t.id === e.tipoEventoId);
  const rotuloFaixa = (id: Id) => ctx.faixasIdade.find((f) => f.id === id)?.rotulo ?? 'Crianças';
  const criancas = e.criancas
    .filter((c) => c.quantidade > 0)
    .map((c) => ({ rotulo: rotuloFaixa(c.faixaIdadeId), quantidade: c.quantidade }));
  const pessoas = (e.adultos ?? 0) + criancas.reduce((n, c) => n + c.quantidade, 0);
  return {
    formato: 1,
    pacote: pacote
      ? {
          nome: pacote.nome,
          duracaoInclusaMin: pacote.duracaoInclusaMin,
          secoes: [...pacote.secoes]
            .sort((a, b) => a.ordem - b.ordem)
            .filter((s) => s.itens.length > 0)
            .map((s) => ({ nome: s.nome, itens: s.itens })),
        }
      : null,
    convidados: { adultos: e.adultos ?? 0, criancas },
    espaco: espaco
      ? {
          nome: espaco.nome,
          noLocalDoCliente: espaco.noLocalDoCliente,
          localCliente: espaco.noLocalDoCliente ? e.localCliente?.trim() || null : null,
        }
      : null,
    abertura: preencherAbertura(d.aberturaModelo, {
      nome: d.clienteNome.trim().split(/\s+/)[0] ?? d.clienteNome,
      data: e.data ? formatData(e.data) : '',
      convidados: String(pessoas),
      tipo: tipo?.nome.toLowerCase() ?? 'sua festa',
      buffet: d.buffetNome,
    }),
    textos: { ...d.textos, sinalBp: ctx.regras.sinalBp },
  };
}

// ---------------------------------------------------------------------------
// Modelo único da proposta (web e PDF desenham só isto)
// ---------------------------------------------------------------------------

export type VersaoProposta = {
  numero: number;
  versao: number;
  status: string;
  emitidaEm: string | null;
  validadeAte: string;
  hoje: string;
  resultado: ResultadoOrcamento;
  conteudo: ConteudoCongelado | null;
  itens: {
    tipo: string;
    descricao: string;
    quantidade: number;
    subtotalCentavos: number;
    detalhe: string | null;
  }[];
  totalCentavos: number;
  data: string;
  convidados: number;
  tipoEvento: string | null;
  turno: { nome: string; horaInicio: string } | null;
  espaco: string | null;
  clienteNome: string | null;
  observacoes: string | null;
};

export type BuffetProposta = {
  nome: string;
  logoUrl: string | null;
  corMarca: string | null;
  razaoSocial: string | null;
  cnpj: string | null;
  endereco: string | null;
  whatsappE164: string | null;
  rodapeOrkestra: boolean;
};

export type LinhaInvestimento = {
  tipo: string;
  descricao: string;
  detalhe: string | null;
  valor: string;
  negativo: boolean;
};

export type ModeloProposta = {
  cores: CoresMarca;
  cabecalho: {
    buffet: string;
    logoUrl: string | null;
    titulo: string;
    numero: string;
    versao: number;
    emitidaEm: string | null;
    validade: string;
  };
  abertura: string | null;
  evento: {
    cliente: string | null;
    tipo: string | null;
    data: string;
    horario: string | null;
    espaco: string | null;
    avisoDeslocamento: string | null;
    convidados: { rotulo: string; quantidade: number }[];
    totalConvidados: number;
  };
  investimento: { linhas: LinhaInvestimento[]; total: string; porConvidado: string | null };
  condicoes: {
    sinal: string | null;
    parcelas: string[];
    formasPagamento: string | null;
    ultimaParcela: string | null;
    texto: string | null;
  };
  cardapio: { pacote: string; secoes: { nome: string; itens: string[] }[] } | null;
  incluso: { duracao: string | null; naoIncluso: string | null } | null;
  politicas: { cancelamento: string | null; alteracaoConvidados: string | null } | null;
  observacoes: string | null;
  rodape: { linhas: string[]; orkestra: boolean };
  validade: EstadoValidade;
};

export { dataPorExtenso };

function duracaoTexto(min: number): string | null {
  if (min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  const horas = h === 1 ? '1 hora' : `${h} horas`;
  return m ? `${horas} e ${m} minutos de festa` : `${horas} de festa`;
}

function listaNatural(itens: string[]): string | null {
  const v = itens.filter(Boolean);
  if (v.length === 0) return null;
  return v.length === 1 ? v[0]! : `${v.slice(0, -1).join(', ')} e ${v[v.length - 1]}`;
}

function textoOuNull(t: string | null | undefined): string | null {
  return t && t.trim() ? t.trim() : null;
}

/** Monta o modelo da proposta a partir da versão congelada e da identidade (viva) do buffet. */
export function montarConteudo(v: VersaoProposta, buffet: BuffetProposta): ModeloProposta {
  const c = v.conteudo;
  const r = v.resultado;
  const numero = numeroProposta(v.numero);
  // Versões da Etapa 4 (sem conteúdo congelado) mostram só o que foi congelado na época.
  const sinalBp = c?.textos.sinalBp ?? null;
  const validade = estadoValidade(v.validadeAte, v.hoje);

  const convidados = c
    ? [
        ...(c.convidados.adultos > 0
          ? [{ rotulo: 'Adultos', quantidade: c.convidados.adultos }]
          : []),
        ...c.convidados.criancas.map((x) => ({
          rotulo: `Crianças de ${x.rotulo}`,
          quantidade: x.quantidade,
        })),
      ]
    : [{ rotulo: 'Convidados', quantidade: v.convidados }];

  const espacoNome = c?.espaco
    ? c.espaco.noLocalDoCliente
      ? `No local do cliente${c.espaco.localCliente ? ` (${c.espaco.localCliente})` : ''}`
      : c.espaco.nome
    : v.espaco;

  const linhas: LinhaInvestimento[] = v.itens.map((i) => ({
    tipo: i.tipo,
    descricao: i.descricao,
    detalhe: textoOuNull(i.detalhe),
    valor:
      i.subtotalCentavos < 0
        ? `- ${formatBRL(-i.subtotalCentavos)}`
        : formatBRL(i.subtotalCentavos),
    negativo: i.subtotalCentavos < 0,
  }));

  const rodape = [
    buffet.razaoSocial?.trim() || buffet.nome,
    buffet.cnpj ? `CNPJ ${mascaraCnpj(buffet.cnpj)}` : null,
    textoOuNull(buffet.endereco),
    buffet.whatsappE164 ? `WhatsApp ${formatPhoneBR(buffet.whatsappE164)}` : null,
  ].filter((x): x is string => !!x);

  return {
    cores: coresDaMarca(buffet.corMarca),
    cabecalho: {
      buffet: buffet.nome,
      logoUrl: buffet.logoUrl,
      titulo: `Proposta nº ${numero} · versão ${v.versao}`,
      numero,
      versao: v.versao,
      emitidaEm: v.emitidaEm ? formatData(v.emitidaEm) : null,
      validade: `Válida até ${formatData(v.validadeAte)}`,
    },
    abertura: textoOuNull(c?.abertura),
    evento: {
      cliente: v.clienteNome,
      tipo: v.tipoEvento,
      data: dataPorExtenso(v.data),
      horario: v.turno ? `${v.turno.nome} · começa às ${v.turno.horaInicio}` : null,
      espaco: espacoNome,
      avisoDeslocamento: c?.espaco?.noLocalDoCliente ? AVISO_DESLOCAMENTO : null,
      convidados,
      totalConvidados: convidados.reduce((n, x) => n + x.quantidade, 0) || v.convidados,
    },
    investimento: {
      linhas,
      total: formatBRL(v.totalCentavos),
      porConvidado: r.porConvidadoCentavos > 0 ? formatBRL(r.porConvidadoCentavos) : null,
    },
    condicoes: {
      sinal:
        r.sinalCentavos > 0
          ? `${formatBRL(r.sinalCentavos)}${sinalBp != null ? ` (${formatBp(sinalBp)})` : ''} para garantir a data`
          : null,
      parcelas: (r.parcelas ?? []).map(
        (p) =>
          `${p.numero}ª parcela: ${formatBRL(p.valorCentavos)} até ${formatData(p.vencimento)}`,
      ),
      formasPagamento: c ? listaNatural(c.textos.formasPagamento) : null,
      ultimaParcela:
        r.parcelas && r.parcelas.length > 0
          ? `Última parcela até ${formatData(r.parcelas[r.parcelas.length - 1]!.vencimento)}`
          : null,
      texto: textoOuNull(c?.textos.condicoes),
    },
    cardapio:
      c?.pacote && c.pacote.secoes.length > 0
        ? { pacote: c.pacote.nome, secoes: c.pacote.secoes }
        : null,
    incluso: c
      ? {
          duracao: c.pacote ? duracaoTexto(c.pacote.duracaoInclusaMin) : null,
          naoIncluso: textoOuNull(c.textos.naoIncluso),
        }
      : null,
    politicas: c
      ? {
          cancelamento: textoOuNull(c.textos.cancelamento),
          alteracaoConvidados: textoOuNull(c.textos.alteracaoConvidados),
        }
      : null,
    observacoes: textoOuNull(v.observacoes),
    rodape: { linhas: rodape, orkestra: buffet.rodapeOrkestra },
    validade,
  };
}

/** Texto plano do modelo (testes de igualdade web × PDF e de vazamento). */
export function textoDoModelo(m: ModeloProposta): string {
  return JSON.stringify(m);
}
