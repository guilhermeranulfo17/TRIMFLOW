import { somarDias } from '@/domain/dates';
import type { ContextoPreco, ResultadoOrcamento } from '@/domain/preco';
import type { Id } from '@/domain/preco';
import {
  congelarConteudo,
  type ConteudoCongelado,
  type TextosComerciais,
  type VitrinePacotes,
} from '@/domain/proposta';
import type { Escolhas } from '@/domain/publico';
import { urlPublicaMidia } from '@/lib/midia';

/*
 * Monta o que é gravado numa versão: itens (cópia das linhas do motor, com a referência ao
 * catálogo), campos denormalizados, validade e o conteúdo congelado. Usado pelo wizard, pela
 * atualização de preços e pelo orçamento interno. Sem banco: só transforma.
 */

export type DadosVersao = {
  resultado: ResultadoOrcamento;
  itens: {
    tipo: string;
    descricao: string;
    quantidade: number;
    valorUnitarioCentavos: number;
    subtotalCentavos: number;
    detalhe: string;
    referenciaId?: string;
  }[];
  campos: {
    tipoEventoId: string;
    data: string;
    turnoId: string;
    espacoId: string;
    convidados: number;
    pacoteId: string | null;
  };
  validade: string;
  conteudo: ConteudoCongelado;
};

export function prepararVersao(d: {
  ctx: ContextoPreco;
  escolhas: Escolhas;
  resultado: ResultadoOrcamento;
  hoje: string;
  textos: TextosComerciais;
  aberturaModelo: string | null;
  clienteNome: string;
  buffetNome: string;
  /** descrição e foto de cada pacote (vitrinePacotesDe); sem ela, a versão sai sem foto */
  vitrinePacotes?: VitrinePacotes;
}): DadosVersao {
  const { ctx, escolhas: e, resultado } = d;
  const ativos = ctx.espacos.filter((x) => x.ativo);
  const espacoId = ativos.length === 1 ? ativos[0]!.id : e.espacoId!;
  const pessoas = (e.adultos ?? 0) + e.criancas.reduce((n, c) => n + c.quantidade, 0);
  return {
    resultado,
    itens: resultado.linhas.map((l) => ({
      tipo: l.tipo,
      descricao: l.descricao,
      quantidade: l.quantidade,
      valorUnitarioCentavos: l.valorUnitarioCentavos,
      subtotalCentavos: l.subtotalCentavos,
      detalhe: l.detalhe,
      ...(l.referenciaId ? { referenciaId: l.referenciaId } : {}),
    })),
    campos: {
      tipoEventoId: e.tipoEventoId!,
      data: e.data!,
      turnoId: e.turnoId!,
      espacoId,
      convidados: Math.max(1, pessoas),
      pacoteId: e.pacoteId ?? null,
    },
    validade: somarDias(d.hoje, ctx.regras.validadeDias),
    conteudo: congelarConteudo({
      ctx,
      escolhas: e,
      textos: d.textos,
      aberturaModelo: d.aberturaModelo,
      clienteNome: d.clienteNome,
      buffetNome: d.buffetNome,
      vitrinePacotes: d.vitrinePacotes,
    }),
  };
}

/**
 * Descrição e URL pública da PRIMEIRA foto de cada pacote, para congelar na versão: o PDF de
 * uma versão emitida mostra sempre a mesma foto (o arquivo não é apagado enquanto alguma
 * proposta o usa: ver fotosEmUso em server/actions/empresa/pacotes).
 */
export function vitrinePacotesDe(
  pacotes: Record<Id, { descricao: string | null; fotos: string[] }>,
): VitrinePacotes {
  return Object.fromEntries(
    Object.entries(pacotes).map(([id, p]) => [
      id,
      { descricao: p.descricao, foto: urlPublicaMidia(p.fotos[0] ?? null) },
    ]),
  );
}
