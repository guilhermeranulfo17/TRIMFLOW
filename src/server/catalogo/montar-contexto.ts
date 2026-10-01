import type { ContextoPreco } from '@/domain/preco';

/*
 * Linhas do catálogo → ContextoPreco. MAPPER ÚNICO: o painel (Drizzle, via RLS) e o link
 * público (publico.contexto_preco, JSON) passam por aqui, então os dois enxergam o mesmo
 * contexto. Sem banco nem 'server-only': é só transformação.
 */

type Linha<T> = T[];

export type LinhasCatalogo = {
  regras: {
    validadeDias: number;
    antecedenciaMinDias: number;
    sinalBp: number;
    parcelasMax: number;
    prazoUltimaParcelaDias: number;
    modoExibicaoPreco: ContextoPreco['regras']['modoExibicaoPreco'];
    ajusteIncide: ContextoPreco['regras']['ajusteIncide'];
    deslocamentoModelo: ContextoPreco['regras']['deslocamentoModelo'];
    deslocamentoKmGratis: number;
    deslocamentoValorKmCentavos: number;
  };
  tiposEvento: Linha<{ id: string; nome: string; ativo: boolean }>;
  espacos: Linha<{
    id: string;
    nome: string;
    capacidadeMax: number;
    noLocalDoCliente: boolean;
    ativo: boolean;
  }>;
  turnos: Linha<{
    id: string;
    nome: string;
    horaInicio: string;
    duracaoMin: number;
    diasSemana: number[];
    ordem: number;
    ativo: boolean;
  }>;
  ajustesDia: Linha<{
    id: string;
    tipo: 'dia_semana' | 'feriado';
    diaSemana: number | null;
    turnoId: string | null;
    ajusteBp: number;
  }>;
  feriados: Linha<{ data: string; nome: string }>;
  faixasIdade: Linha<{
    id: string;
    rotulo: string;
    idadeMin: number;
    idadeMax: number | null;
    fatorBp: number;
    pacoteId: string | null;
    ordem: number;
  }>;
  pacotes: Linha<{
    id: string;
    nome: string;
    subtitulo: string | null;
    destaque: boolean;
    modeloPreco: 'por_pessoa' | 'por_faixa';
    precoPessoaCentavos: number | null;
    valorExcedenteCentavos: number | null;
    minConvidados: number;
    maxConvidados: number | null;
    duracaoInclusaMin: number;
    valorHoraExtraCentavos: number;
    ordem: number;
    ativo: boolean;
  }>;
  faixasPreco: Linha<{ pacoteId: string; ateConvidados: number; valorCentavos: number }>;
  secoesCardapio: Linha<{ pacoteId: string; nome: string; itens: string[]; ordem: number }>;
  pacoteTiposEvento: Linha<{ pacoteId: string; tipoEventoId: string }>;
  opcionais: Linha<{
    id: string;
    nome: string;
    descricao: string | null;
    cobranca: 'por_pessoa' | 'fixo' | 'por_unidade' | 'por_hora';
    precoCentavos: number;
    qtdMin: number;
    qtdMax: number | null;
    ordem: number;
    ativo: boolean;
  }>;
  opcionalPacotes: Linha<{ opcionalId: string; pacoteId: string; relacao: string }>;
  opcionalTiposEvento: Linha<{ opcionalId: string; tipoEventoId: string }>;
  faixasDeslocamento: Linha<{ ateKm: number; valorCentavos: number }>;
};

function agrupar<T, K extends string>(linhas: T[], chave: (l: T) => K): Map<K, T[]> {
  const mapa = new Map<K, T[]>();
  for (const l of linhas) {
    const k = chave(l);
    mapa.set(k, [...(mapa.get(k) ?? []), l]);
  }
  return mapa;
}

export function montarContexto(l: LinhasCatalogo): ContextoPreco {
  const faixasPorPacote = agrupar(l.faixasPreco, (f) => f.pacoteId);
  const secoesPorPacote = agrupar(l.secoesCardapio, (s) => s.pacoteId);
  const tiposPorPacote = agrupar(l.pacoteTiposEvento, (v) => v.pacoteId);
  const pacotesPorOpcional = agrupar(l.opcionalPacotes, (v) => v.opcionalId);
  const tiposPorOpcional = agrupar(l.opcionalTiposEvento, (v) => v.opcionalId);
  const r = l.regras;

  return {
    regras: {
      validadeDias: r.validadeDias,
      antecedenciaMinDias: r.antecedenciaMinDias,
      sinalBp: r.sinalBp,
      parcelasMax: r.parcelasMax,
      prazoUltimaParcelaDias: r.prazoUltimaParcelaDias,
      modoExibicaoPreco: r.modoExibicaoPreco,
      ajusteIncide: r.ajusteIncide,
      deslocamentoModelo: r.deslocamentoModelo,
      deslocamentoKmGratis: r.deslocamentoKmGratis,
      deslocamentoValorKmCentavos: r.deslocamentoValorKmCentavos,
    },
    tiposEvento: l.tiposEvento.map((t) => ({ id: t.id, nome: t.nome, ativo: t.ativo })),
    espacos: l.espacos.map((e) => ({
      id: e.id,
      nome: e.nome,
      capacidadeMax: e.capacidadeMax,
      noLocalDoCliente: e.noLocalDoCliente,
      ativo: e.ativo,
    })),
    turnos: l.turnos.map((t) => ({
      id: t.id,
      nome: t.nome,
      horaInicio: t.horaInicio.slice(0, 5),
      duracaoMin: t.duracaoMin,
      diasSemana: [...t.diasSemana].sort((a, b) => a - b),
      ordem: t.ordem,
      ativo: t.ativo,
    })),
    ajustesDia: l.ajustesDia.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      diaSemana: a.diaSemana,
      turnoId: a.turnoId,
      ajusteBp: a.ajusteBp,
    })),
    feriados: l.feriados.map((f) => ({ data: f.data, nome: f.nome })),
    faixasIdade: l.faixasIdade.map((f) => ({
      id: f.id,
      rotulo: f.rotulo,
      idadeMin: f.idadeMin,
      idadeMax: f.idadeMax,
      fatorBp: f.fatorBp,
      pacoteId: f.pacoteId,
      ordem: f.ordem,
    })),
    pacotes: l.pacotes.map((p) => ({
      id: p.id,
      nome: p.nome,
      subtitulo: p.subtitulo,
      destaque: p.destaque,
      modeloPreco: p.modeloPreco,
      precoPessoaCentavos: p.precoPessoaCentavos,
      valorExcedenteCentavos: p.valorExcedenteCentavos,
      minConvidados: p.minConvidados,
      maxConvidados: p.maxConvidados,
      duracaoInclusaMin: p.duracaoInclusaMin,
      valorHoraExtraCentavos: p.valorHoraExtraCentavos,
      ordem: p.ordem,
      ativo: p.ativo,
      faixasPreco: (faixasPorPacote.get(p.id) ?? []).map((f) => ({
        ateConvidados: f.ateConvidados,
        valorCentavos: f.valorCentavos,
      })),
      secoes: (secoesPorPacote.get(p.id) ?? []).map((s) => ({
        nome: s.nome,
        itens: s.itens,
        ordem: s.ordem,
      })),
      tiposEventoIds: (tiposPorPacote.get(p.id) ?? []).map((v) => v.tipoEventoId),
    })),
    opcionais: l.opcionais.map((o) => {
      const vinculos = pacotesPorOpcional.get(o.id) ?? [];
      return {
        id: o.id,
        nome: o.nome,
        descricao: o.descricao,
        cobranca: o.cobranca,
        precoCentavos: o.precoCentavos,
        qtdMin: o.qtdMin,
        qtdMax: o.qtdMax,
        ordem: o.ordem,
        ativo: o.ativo,
        pacotesCompativeisIds: vinculos
          .filter((v) => v.relacao === 'compativel')
          .map((v) => v.pacoteId),
        pacotesInclusoIds: vinculos.filter((v) => v.relacao === 'incluso').map((v) => v.pacoteId),
        tiposEventoIds: (tiposPorOpcional.get(o.id) ?? []).map((v) => v.tipoEventoId),
      };
    }),
    faixasDeslocamento: l.faixasDeslocamento.map((d) => ({
      ateKm: d.ateKm,
      valorCentavos: d.valorCentavos,
    })),
  };
}

/** snake_case → camelCase recursivo nas chaves (linhas do JSON de publico.contexto_preco). */
export function camelizar<T>(valor: unknown): T {
  if (Array.isArray(valor)) return valor.map((v) => camelizar(v)) as T;
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [
        k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()),
        // itens do cardápio e fotos são listas de texto: camelizar não muda nada nelas.
        camelizar(v),
      ]),
    ) as T;
  }
  return valor as T;
}
