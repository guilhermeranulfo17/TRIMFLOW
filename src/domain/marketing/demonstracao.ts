import { compararDatas, diaDaSemanaNumero, somarDias, type DataCivil } from '../dates';
import type { ContextoPreco } from '../preco/tipos';
import { pessoas } from '../publico/passos';
import { montarPrevia, type Previa } from '../publico/previa';
import type { Escolhas } from '../publico/tipos';
import { montarVitrine, type ExtrasPacote, type VitrinePublica } from '../publico/vitrine';

/*
 * Demonstração da landing: o visitante monta um orçamento no "Buffet Exemplo" como se fosse o
 * cliente. Os passos Pacote e Extras são os MESMOS componentes do link público, e a prévia sai do
 * MESMO montarPrevia (calcularOrcamento) que o servidor usa no link, só que aqui roda no
 * navegador, sobre um catálogo de exemplo com preços fictícios. Nada vai ao servidor: não gera
 * lead, reserva nem número.
 *
 * Este módulo não importa domain/modelos (que traz o Zod): o servidor monta o exemplo com
 * contextoDoModelo e entrega tudo pronto à ilha do cliente.
 */

export const NOME_BUFFET_EXEMPLO = 'Buffet Exemplo';
/** Cor do buffet de exemplo: o verde escuro da identidade do Orkestra. */
export const COR_BUFFET_EXEMPLO = '#1E7A3F';
/** Cliente fictício que "faz o pedido" (nome de exemplo, não é depoimento). */
export const CLIENTE_EXEMPLO = 'Mariana';

/** Quantos extras o exemplo mostra (cabe numa tela de celular). */
const MAX_EXTRAS = 3;
const SABADO = 6;
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

export type ExemploDemonstracao = {
  buffet: string;
  contexto: ContextoPreco;
  /** o que o link público entrega ao navegador (mesmo formato dos passos reais) */
  vitrine: VitrinePublica;
  hoje: DataCivil;
  /** festa já escolhida: tipo, data (sábado à tarde), espaço, convidados e o pacote em destaque */
  inicial: Escolhas;
  convidados: { min: number; max: number; passo: number };
};

/** Primeiro sábado a partir de `hoje + dias`. */
export function proximoSabado(hoje: DataCivil, dias = 30): DataCivil {
  let d = somarDias(hoje, dias);
  while (diaDaSemanaNumero(d) !== SABADO) d = somarDias(d, 1);
  return d;
}

/**
 * Monta o exemplo a partir de um contexto (o do modelo infantil, no servidor): preço sempre
 * exato, sem hora extra e com poucos extras, para a demonstração caber numa tela.
 */
export function montarExemploDemonstracao(
  original: ContextoPreco,
  hoje: DataCivil,
  extras: Record<string, ExtrasPacote> = {},
): ExemploDemonstracao {
  const tipo = original.tiposEvento.find((t) => t.ativo);
  const espaco = original.espacos.find((e) => e.ativo && !e.noLocalDoCliente);
  const turno =
    original.turnos.find((t) => t.ativo && /tarde/i.test(t.nome)) ??
    original.turnos.find((t) => t.ativo);
  const pacotes = original.pacotes.filter(
    (p) => p.ativo && (p.tiposEventoIds.length === 0 || p.tiposEventoIds.includes(tipo?.id ?? '')),
  );
  if (!tipo || !espaco || !turno || pacotes.length === 0) {
    throw new Error('Catálogo de exemplo incompleto para a demonstração.');
  }
  const opcionais = original.opcionais
    .filter((o) => o.ativo && (o.cobranca === 'fixo' || o.cobranca === 'por_unidade'))
    .sort((a, b) => a.ordem - b.ordem)
    .slice(0, MAX_EXTRAS);
  const contexto: ContextoPreco = {
    ...original,
    regras: { ...original.regras, modoExibicaoPreco: 'exato' },
    tiposEvento: [tipo],
    pacotes: pacotes.map((p) => ({ ...p, valorHoraExtraCentavos: 0 })),
    opcionais,
  };
  const min = Math.max(...pacotes.map((p) => p.minConvidados));
  const max = Math.min(espaco.capacidadeMax, ...pacotes.map((p) => p.maxConvidados ?? 500));
  const pacote = pacotes.find((p) => p.destaque) ?? pacotes[0]!;
  return {
    buffet: NOME_BUFFET_EXEMPLO,
    contexto,
    vitrine: montarVitrine(contexto, extras, hoje),
    hoje,
    inicial: {
      tipoEventoId: tipo.id,
      data: proximoSabado(hoje),
      turnoId: turno.id,
      espacoId: espaco.id,
      adultos: Math.min(max, Math.max(min, 50)),
      criancas: [],
      pacoteId: pacote.id,
      opcionais: [],
      horasExtras: 0,
    },
    convidados: { min, max, passo: 10 },
  };
}

/** Convidados dentro dos limites do exemplo (todos os pacotes continuam disponíveis). */
export function comConvidados(ex: ExemploDemonstracao, e: Escolhas, n: number): Escolhas {
  const { min, max } = ex.convidados;
  const valor = Number.isFinite(n) ? Math.round(n) : min;
  return { ...e, adultos: Math.min(max, Math.max(min, valor)) };
}

/** A data do exemplo nunca fica no passado (página em cache ou aba aberta há dias). */
function comDataFutura(ex: ExemploDemonstracao, e: Escolhas): Escolhas {
  return e.data && compararDatas(e.data, ex.hoje) > 0 ? e : { ...e, data: proximoSabado(ex.hoje) };
}

/** Prévia igual à do link público depois do contato: total por pacote, extras e resultado. */
export function previaDaDemonstracao(ex: ExemploDemonstracao, e: Escolhas): Previa {
  return montarPrevia(ex.contexto, comDataFutura(ex, e), {
    hoje: ex.hoje,
    comContato: true,
    modo: 'exato',
  });
}

/** "2026-12-12" → "sáb, 12/12" (data civil, sem fuso). */
export function diaCurtoDoPedido(data: DataCivil): string {
  return `${DIAS[diaDaSemanaNumero(data)]}, ${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** O pedido como o dono do buffet recebe: quem, quando, quantos, o quê e quanto. */
export type PedidoDemonstracao = {
  cliente: string;
  tipoEvento: string;
  /** "sáb, 12/12 · Tarde" */
  quando: string;
  convidados: number;
  pacote: string | null;
  /** "Mesa temática", "2 × Personagem vivo" */
  extras: string[];
  totalCentavos: number | null;
  sinalCentavos: number | null;
};

export function pedidoDaDemonstracao(
  ex: ExemploDemonstracao,
  escolhas: Escolhas,
  previa: Previa,
): PedidoDemonstracao {
  const e = comDataFutura(ex, escolhas);
  const turno = ex.vitrine.turnos.find((t) => t.id === e.turnoId)?.nome;
  const ok = previa.resultado?.ok === true;
  return {
    cliente: CLIENTE_EXEMPLO,
    tipoEvento: ex.vitrine.tiposEvento.find((t) => t.id === e.tipoEventoId)?.nome ?? '',
    quando: [e.data ? diaCurtoDoPedido(e.data) : null, turno].filter(Boolean).join(' · '),
    convidados: pessoas(e),
    pacote: ex.vitrine.pacotes.find((p) => p.id === e.pacoteId)?.nome ?? null,
    extras: e.opcionais
      .filter((o) => o.quantidade > 0)
      .flatMap((o) => {
        const nome = ex.vitrine.opcionais.find((x) => x.id === o.opcionalId)?.nome;
        if (!nome) return [];
        return [o.quantidade > 1 ? `${o.quantidade} × ${nome}` : nome];
      }),
    totalCentavos: ok ? previa.resultado!.totalCentavos : null,
    sinalCentavos: ok ? previa.resultado!.sinalCentavos : null,
  };
}
