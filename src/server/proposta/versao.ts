import { somarDias } from '@/domain/dates';
import type { ContextoPreco, ResultadoOrcamento } from '@/domain/preco';
import {
  congelarConteudo,
  type ConteudoCongelado,
  type TextosComerciais,
  type VitrineOpcionais,
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
  /** fotos do catálogo (vitrineDoCatalogo); sem ela, a versão sai sem foto */
  vitrine?: VitrineCatalogo;
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
      vitrinePacotes: d.vitrine?.pacotes,
      vitrineOpcionais: d.vitrine?.opcionais,
    }),
  };
}

/** Fotos do catálogo como estão no banco (caminhos no bucket). */
export type FotosCatalogo = {
  pacotes: { id: string; descricao: string | null; fotos: string[] }[];
  secoes: { pacoteId: string; nome: string; ordem: number; fotoUrl: string | null }[];
  opcionais: { id: string; fotos: string[] }[];
};

export type VitrineCatalogo = { pacotes: VitrinePacotes; opcionais: VitrineOpcionais };

/**
 * URLs públicas a congelar na versão: a PRIMEIRA foto de cada pacote e de cada opcional e a
 * foto de cada seção do cardápio. O PDF de uma versão emitida mostra sempre as mesmas fotos (o
 * arquivo não é apagado enquanto alguma proposta o usa: server/catalogo/fotos-em-uso).
 */
export function vitrineDoCatalogo(f: FotosCatalogo | undefined): VitrineCatalogo {
  // entrada do cache de antes desta versão (sem a lista): a versão sai sem foto
  if (!f) return { pacotes: {}, opcionais: {} };
  return {
    pacotes: Object.fromEntries(
      f.pacotes.map((p) => [
        p.id,
        {
          descricao: p.descricao,
          foto: urlPublicaMidia(p.fotos[0] ?? null),
          secoes: f.secoes
            .filter((s) => s.pacoteId === p.id)
            .map((s) => ({ nome: s.nome, ordem: s.ordem, foto: urlPublicaMidia(s.fotoUrl) })),
        },
      ]),
    ),
    opcionais: Object.fromEntries(
      f.opcionais.map((o) => [o.id, { foto: urlPublicaMidia(o.fotos[0] ?? null) }]),
    ),
  };
}
