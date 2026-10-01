import { contarConvidados } from '../preco/equivalentes';
import { dataCivilValida, diaDaSemanaNumero } from '../dates';
import {
  pacotesDisponiveis,
  type ContextoPreco,
  type DataCivil,
  type Id,
  type PacoteCtx,
} from '../preco';
import type { Escolhas } from './tipos';

export type NumeroPasso = 1 | 2 | 3 | 4 | 5 | 6;

export const PASSOS: { numero: NumeroPasso; titulo: string; curto: string }[] = [
  { numero: 1, titulo: 'Qual é a festa?', curto: 'Festa' },
  { numero: 2, titulo: 'Quando e para quantos?', curto: 'Data' },
  { numero: 3, titulo: 'Para onde mandamos o orçamento?', curto: 'Contato' },
  { numero: 4, titulo: 'Escolha o pacote', curto: 'Pacote' },
  { numero: 5, titulo: 'Quer algum extra?', curto: 'Extras' },
  { numero: 6, titulo: 'Sua proposta', curto: 'Proposta' },
];

/** O passo do WhatsApp: antes dele, nenhum dado pessoal; depois dele, o servidor guarda tudo. */
export const PASSO_CONTATO = 3;

export function passoValido(valor: unknown): NumeroPasso | null {
  const n = typeof valor === 'string' ? Number(valor) : valor;
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6 ? n : null;
}

/** Com `?tipo=` válido, o passo 1 é pulado. */
export function primeiroPasso(tipoNaUrl: boolean): NumeroPasso {
  return tipoNaUrl ? 2 : 1;
}

export function proximoPasso(passo: NumeroPasso): NumeroPasso | null {
  return passo < 6 ? ((passo + 1) as NumeroPasso) : null;
}

export function passoAnterior(passo: NumeroPasso, tipoNaUrl = false): NumeroPasso | null {
  const anterior = passo - 1;
  if (anterior < primeiroPasso(tipoNaUrl)) return null;
  return anterior as NumeroPasso;
}

/**
 * O que as regras dos passos precisam saber. No servidor vem do ContextoPreco
 * (`dadosDoContexto`); no navegador, da vitrine + a prévia (que nunca têm tabela de preço).
 * As listas já vêm só com itens ativos.
 */
export type DadosPassos = {
  tiposEvento: { id: Id }[];
  turnos: { id: Id; diasSemana: number[] }[];
  espacos: { id: Id; nome: string; capacidadeMax: number; noLocalDoCliente: boolean }[];
  /** pacotes do tipo escolhido, com disponibilidade pelos convidados (prévia do servidor) */
  pacotes?: { id: Id; disponivel: boolean; motivo?: string }[];
};

export function dadosDoContexto(ctx: ContextoPreco, e: Escolhas): DadosPassos {
  return {
    tiposEvento: ctx.tiposEvento.filter((t) => t.ativo),
    turnos: ctx.turnos.filter((t) => t.ativo),
    espacos: ctx.espacos.filter((x) => x.ativo),
    pacotes: pacotesDoPasso(ctx, e).map((p) => ({
      id: p.pacote.id,
      disponivel: p.disponivel,
      ...(p.motivo ? { motivo: p.motivo } : {}),
    })),
  };
}

/** Com um só espaço, ele é escolhido sozinho. */
export function espacoEscolhido<T extends { id: Id }>(espacos: T[], e: Escolhas): T | null {
  if (espacos.length === 1) return espacos[0]!;
  return espacos.find((x) => x.id === e.espacoId) ?? null;
}

/** Turnos que existem no dia da semana da data. */
export function turnosNaData<T extends { diasSemana: number[] }>(
  turnos: T[],
  data: DataCivil,
): T[] {
  if (!dataCivilValida(data)) return [];
  const dia = diaDaSemanaNumero(data);
  return turnos.filter((t) => t.diasSemana.includes(dia));
}

export function pessoas(e: Escolhas): number {
  return (e.adultos ?? 0) + e.criancas.reduce((n, c) => n + c.quantidade, 0);
}

/**
 * Por que o botão "Avançar" está desabilitado neste passo (null = pode avançar).
 * O passo 3 (contato) tem validação própria no formulário.
 */
export function motivoDoBotaoDesabilitado(
  passo: NumeroPasso,
  e: Escolhas,
  d: DadosPassos,
): string | null {
  switch (passo) {
    case 1:
      if (!e.tipoEventoId || !d.tiposEvento.some((t) => t.id === e.tipoEventoId)) {
        return 'Escolha o tipo de festa.';
      }
      return null;
    case 2: {
      const espaco = espacoEscolhido(d.espacos, e);
      if (!espaco) return 'Escolha o espaço.';
      if (!e.data) return 'Escolha a data da festa.';
      if (!e.turnoId || !turnosNaData(d.turnos, e.data).some((t) => t.id === e.turnoId)) {
        return 'Escolha o horário.';
      }
      if (pessoas(e) < 1) return 'Informe quantos convidados.';
      if (pessoas(e) > espaco.capacidadeMax) {
        return `${espaco.nome} recebe até ${espaco.capacidadeMax} pessoas.`;
      }
      if (espaco.noLocalDoCliente && !(e.localCliente && e.localCliente.trim().length >= 3)) {
        return 'Informe o bairro e a cidade da festa.';
      }
      return null;
    }
    case 3:
      return null;
    case 4: {
      if (!e.pacoteId) return 'Escolha um pacote.';
      const pacote = d.pacotes?.find((p) => p.id === e.pacoteId);
      if (!pacote) return 'Escolha um pacote.';
      if (!pacote.disponivel) return `Esse pacote é ${pacote.motivo}.`;
      return null;
    }
    default:
      return null;
  }
}

/** O cliente pode estar neste passo? Devolve o maior passo permitido até `pedido`. */
export function passoPermitido(
  pedido: NumeroPasso,
  e: Escolhas,
  d: DadosPassos,
  opcoes: { temToken: boolean; tipoNaUrl?: boolean },
): NumeroPasso {
  let passo = primeiroPasso(opcoes.tipoNaUrl ?? false);
  while (passo < pedido) {
    if (passo === PASSO_CONTATO && !opcoes.temToken) return passo;
    if (motivoDoBotaoDesabilitado(passo, e, d)) return passo;
    passo = (passo + 1) as NumeroPasso;
  }
  return passo;
}

/** Pacotes do tipo de festa, marcando os fora do mínimo/máximo de convidados. */
export function pacotesDoPasso(ctx: ContextoPreco, e: Escolhas): PacoteDoPasso[] {
  if (!e.tipoEventoId) return [];
  return pacotesDisponiveis(ctx, { tipoEventoId: e.tipoEventoId }).map(({ pacote }) => {
    const eq = contarConvidados(ctx, pacote.id, e.adultos ?? 0, e.criancas).equivalentes;
    if (eq < pacote.minConvidados) {
      return {
        pacote,
        equivalentes: eq,
        disponivel: false,
        motivo: `a partir de ${pacote.minConvidados} convidados`,
      };
    }
    if (pacote.maxConvidados !== null && eq > pacote.maxConvidados) {
      return {
        pacote,
        equivalentes: eq,
        disponivel: false,
        motivo: `até ${pacote.maxConvidados} convidados`,
      };
    }
    return { pacote, equivalentes: eq, disponivel: true };
  });
}

export type PacoteDoPasso = {
  pacote: PacoteCtx;
  equivalentes: number;
  disponivel: boolean;
  motivo?: string;
};
