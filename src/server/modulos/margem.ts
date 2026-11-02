import 'server-only';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { compararDatas, hojeNoFuso, somarDias } from '@/domain/dates';
import {
  compararPacotes,
  ehCategoria,
  pendenciasDaFesta,
  resumoMargem,
  type CategoriaCusto,
  type ComparacaoPacote,
  type CustoPacote,
  type ItemCustoFesta,
  type PendenciaMargem,
  type ResumoMargem,
} from '@/domain/modulos';
import type { UsuarioAtual } from '@/server/auth/sessao';
import {
  margemCustosFesta,
  margemCustosPacote,
  margemFestas,
  orcamentoItens,
  pacotes,
  reservas,
} from '@/server/db/schema';
import { carregarFinanceiroDaFesta } from '@/server/financeiro/carregar';
import { naTransacao, type Tx } from '@/server/db/tenant';
import { moduloComAcesso } from './carregar';

/*
 * Leituras do OrkMargem (só o dono, RLS). Receita contratada e recebido vêm do Financeiro
 * (mesma regra das telas de pagamento); custos, das tabelas do módulo. A leitura vale também
 * sem o módulo vigente (histórico); `acesso` diz se dá para registrar.
 */

export type PacoteCustos = { id: string; nome: string; ativo: boolean; custos: CustoPacote[] };

export type FestaMargemLinha = {
  reservaId: string;
  cliente: string;
  data: string;
  pacote: string | null;
  receitaCentavos: number;
  preparada: boolean;
  fechada: boolean;
  resumo: ResumoMargem;
  pendencias: PendenciaMargem[];
};

export type PainelMargem = {
  acesso: boolean;
  hoje: string;
  pacotes: PacoteCustos[];
  festas: FestaMargemLinha[];
  comparacao: ComparacaoPacote[];
};

const confirmadas = () =>
  and(eq(reservas.tipo, 'confirmada'), inArray(reservas.status, ['ativa', 'realizada']));

const itensDe = (linhas: (typeof margemCustosFesta.$inferSelect)[]): ItemCustoFesta[] =>
  linhas.flatMap((l) =>
    ehCategoria(l.categoria)
      ? [
          {
            categoria: l.categoria,
            descricao: l.descricao,
            previstoCentavos: l.previstoCentavos,
            realizadoCentavos: l.realizadoCentavos,
          },
        ]
      : [],
  );

/** Painel do OrkMargem: custos dos pacotes, festas do último ano em diante e comparação. */
export async function carregarPainelMargem(usuario: UsuarioAtual, tx?: Tx): Promise<PainelMargem> {
  const hoje = hojeNoFuso(usuario.empresa.fuso);
  return naTransacao(usuario.id, tx, async (t) => {
    const [acesso, listaPacotes, custos, festas, preparadas, itens] = await Promise.all([
      moduloComAcesso(usuario, 'orkmargem', { tx: t }),
      t
        .select({ id: pacotes.id, nome: pacotes.nome, ativo: pacotes.ativo })
        .from(pacotes)
        .orderBy(desc(pacotes.ativo), asc(pacotes.ordem), asc(pacotes.nome)),
      t.select().from(margemCustosPacote),
      t
        .select({
          id: reservas.id,
          cliente: reservas.clienteNome,
          data: reservas.data,
          total: reservas.valorTotalCentavos,
        })
        .from(reservas)
        .where(and(confirmadas(), gte(reservas.data, somarDias(hoje, -365))))
        .orderBy(desc(reservas.data))
        .limit(300),
      t.select().from(margemFestas),
      t.select().from(margemCustosFesta).orderBy(asc(margemCustosFesta.ordem)),
    ]);
    const pacotesTela: PacoteCustos[] = listaPacotes.map((p) => ({
      ...p,
      custos: custos.flatMap((c) =>
        c.pacoteId === p.id && ehCategoria(c.categoria)
          ? [
              {
                categoria: c.categoria as CategoriaCusto,
                fixoCentavos: c.fixoCentavos,
                porConvidadoCentavos: c.porConvidadoCentavos,
              },
            ]
          : [],
      ),
    }));
    const porReserva = new Map(preparadas.map((f) => [f.reservaId, f]));
    const linhas: FestaMargemLinha[] = festas.map((r) => {
      const f = porReserva.get(r.id);
      const its = itensDe(itens.filter((i) => i.reservaId === r.id));
      const receita = r.total ?? 0;
      // na lista, o recebido não entra (a festa abre com o Financeiro completo)
      const resumo = resumoMargem({
        receitaContratadaCentavos: receita,
        recebidoCentavos: 0,
        itens: its,
      });
      return {
        reservaId: r.id,
        cliente: r.cliente,
        data: r.data,
        pacote: f?.pacoteNome ?? null,
        receitaCentavos: receita,
        preparada: Boolean(f),
        fechada: Boolean(f?.fechadaEm),
        resumo,
        pendencias: pendenciasDaFesta({
          itens: its,
          receitaContratadaCentavos: receita,
          festaPassou: compararDatas(r.data, hoje) < 0,
          fechada: Boolean(f?.fechadaEm),
        }),
      };
    });
    const comparacao = compararPacotes(
      linhas
        .filter((l) => l.preparada)
        .map((l) => ({
          pacote: l.pacote,
          receitaContratadaCentavos: l.receitaCentavos,
          custoPrevistoCentavos: l.resumo.custoPrevistoCentavos,
          custoRealizadoCentavos:
            l.resumo.margemRealizadaCentavos === null ? null : l.resumo.custoRealizadoCentavos,
        })),
    );
    return { acesso, hoje, pacotes: pacotesTela, festas: linhas, comparacao };
  });
}

export type MargemDaFesta = {
  acesso: boolean;
  reservaId: string;
  cliente: string;
  data: string;
  convidados: number | null;
  hoje: string;
  preparada: boolean;
  fechada: boolean;
  fechadaEm: string | null;
  pacote: string | null;
  /** pacote do orçamento da reserva (sugestão para preparar) */
  pacoteSugerido: { id: string; nome: string } | null;
  /** receita do orçamento: pacote e adicionais (quando a reserva veio de um orçamento) */
  receitaOrcamento: { pacoteCentavos: number; adicionaisCentavos: number } | null;
  itens: ItemCustoFesta[];
  resumo: ResumoMargem;
  pendencias: PendenciaMargem[];
  pacotes: { id: string; nome: string }[];
};

/** Margem de uma festa confirmada (null se não existir ou não for confirmada). */
export async function carregarMargemDaFesta(
  usuario: UsuarioAtual,
  reservaId: string,
  tx?: Tx,
): Promise<MargemDaFesta | null> {
  if (!/^[0-9a-f-]{36}$/i.test(reservaId)) return null;
  return naTransacao(usuario.id, tx, async (t) => {
    const fin = await carregarFinanceiroDaFesta(usuario, reservaId, t);
    if (!fin) return null;
    const [acesso, [festa], linhas, [res], listaPacotes] = await Promise.all([
      moduloComAcesso(usuario, 'orkmargem', { tx: t }),
      t.select().from(margemFestas).where(eq(margemFestas.reservaId, reservaId)),
      t
        .select()
        .from(margemCustosFesta)
        .where(eq(margemCustosFesta.reservaId, reservaId))
        .orderBy(asc(margemCustosFesta.ordem)),
      t
        .select({ orcamentoId: reservas.orcamentoId })
        .from(reservas)
        .where(eq(reservas.id, reservaId)),
      t
        .select({ id: pacotes.id, nome: pacotes.nome })
        .from(pacotes)
        .where(eq(pacotes.ativo, true))
        .orderBy(asc(pacotes.ordem), asc(pacotes.nome)),
    ]);
    let pacoteSugerido: MargemDaFesta['pacoteSugerido'] = null;
    let receitaOrcamento: MargemDaFesta['receitaOrcamento'] = null;
    if (res?.orcamentoId) {
      const its = await t
        .select({
          tipo: orcamentoItens.tipo,
          subtotal: orcamentoItens.subtotalCentavos,
        })
        .from(orcamentoItens)
        .where(eq(orcamentoItens.orcamentoId, res.orcamentoId));
      if (its.length > 0) {
        const pacote = its.filter((i) => i.tipo === 'pacote').reduce((s, i) => s + i.subtotal, 0);
        const resto = its.filter((i) => i.tipo !== 'pacote').reduce((s, i) => s + i.subtotal, 0);
        receitaOrcamento = { pacoteCentavos: pacote, adicionaisCentavos: resto };
      }
      const [p] = await t.execute<{ id: string; nome: string }>(
        sql`select pc.id, pc.nome from public.orcamentos o,
              jsonb_array_elements(coalesce(o.resultado -> 'linhas', '[]'::jsonb)) l
            join public.pacotes pc on pc.id::text = l ->> 'referenciaId'
            where o.id = ${res.orcamentoId} and l ->> 'tipo' = 'pacote' limit 1`,
      );
      if (p) pacoteSugerido = { id: p.id, nome: p.nome };
    }
    const itens = itensDe(linhas);
    const receita = fin.situacao.totalCentavos;
    const fechada = Boolean(festa?.fechadaEm);
    return {
      acesso,
      reservaId,
      cliente: fin.cliente,
      data: fin.data,
      convidados: fin.convidados,
      hoje: fin.hoje,
      preparada: Boolean(festa),
      fechada,
      fechadaEm: festa?.fechadaEm ? new Date(festa.fechadaEm).toISOString() : null,
      pacote: festa?.pacoteNome ?? null,
      pacoteSugerido,
      receitaOrcamento,
      itens,
      resumo: resumoMargem({
        receitaContratadaCentavos: receita,
        recebidoCentavos: fin.situacao.recebidoCentavos,
        itens,
      }),
      pendencias: festa
        ? pendenciasDaFesta({
            itens,
            receitaContratadaCentavos: receita,
            festaPassou: compararDatas(fin.data, fin.hoje) < 0,
            fechada,
          })
        : ['sem_previsao'],
      pacotes: listaPacotes,
    };
  });
}
