import { contarConvidados } from '../preco/equivalentes';
import {
  pacotesDisponiveis,
  turnosDoDia,
  type ContextoPreco,
  type EspacoCtx,
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

/** Espaços ativos; com um só, ele é escolhido sozinho. */
export function espacosAtivos(ctx: ContextoPreco): EspacoCtx[] {
  return ctx.espacos.filter((e) => e.ativo);
}

export function espacoEscolhido(ctx: ContextoPreco, e: Escolhas): EspacoCtx | null {
  const ativos = espacosAtivos(ctx);
  if (ativos.length === 1) return ativos[0]!;
  return ativos.find((x) => x.id === e.espacoId) ?? null;
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
  ctx: ContextoPreco,
): string | null {
  switch (passo) {
    case 1:
      if (!e.tipoEventoId || !ctx.tiposEvento.some((t) => t.ativo && t.id === e.tipoEventoId)) {
        return 'Escolha o tipo de festa.';
      }
      return null;
    case 2: {
      if (!e.data) return 'Escolha a data da festa.';
      if (!e.turnoId || !turnosDoDia(ctx, e.data).some((t) => t.id === e.turnoId)) {
        return 'Escolha o horário.';
      }
      const espaco = espacoEscolhido(ctx, e);
      if (!espaco) return 'Escolha o espaço.';
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
      const disponivel = pacotesDoPasso(ctx, e).find((p) => p.pacote.id === e.pacoteId);
      if (!disponivel) return 'Escolha um pacote.';
      if (!disponivel.disponivel) return `Esse pacote é ${disponivel.motivo}.`;
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
  ctx: ContextoPreco,
  opcoes: { temToken: boolean; tipoNaUrl?: boolean },
): NumeroPasso {
  let passo = primeiroPasso(opcoes.tipoNaUrl ?? false);
  while (passo < pedido) {
    if (passo === PASSO_CONTATO && !opcoes.temToken) return passo;
    if (motivoDoBotaoDesabilitado(passo, e, ctx)) return passo;
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
