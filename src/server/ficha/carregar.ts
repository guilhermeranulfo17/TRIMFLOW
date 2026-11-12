import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { ConteudoCongelado } from '@/domain/proposta';
import { montarFicha, type CobrancaOpcional, type FichaCozinha } from '@/domain/ficha/cozinha';
import type { UsuarioAtual } from '@/server/auth/sessao';
import {
  espacos,
  opcionais,
  orcamentoItens,
  orcamentos,
  pacotes,
  reservas,
  tiposEvento,
  turnos,
} from '@/server/db/schema';
import { naTransacao, type Tx } from '@/server/db/tenant';

/*
 * Ficha da cozinha de uma reserva CONFIRMADA (ativa ou realizada), pelo RLS: só usuários da
 * empresa da reserva leem. Duas consultas em pipeline (a reserva com o orçamento ligado e os
 * itens desse orçamento). Nenhum valor em dinheiro sai daqui.
 */

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FichaCarregada = { ficha: FichaCozinha; cliente: string; data: string };

export async function carregarFichaCozinha(
  usuario: UsuarioAtual,
  reservaId: string,
  tx?: Tx,
): Promise<FichaCarregada | null> {
  if (!ID.test(reservaId)) return null;
  return naTransacao(usuario.id, tx, async (tx) => {
    const [[r], itens] = await Promise.all([
      tx
        .select({
          cliente: reservas.clienteNome,
          data: reservas.data,
          inicio: reservas.inicio,
          convidados: reservas.convidados,
          observacoes: reservas.observacoes,
          tipoEvento: tiposEvento.nome,
          turno: turnos.nome,
          turnoDuracao: turnos.duracaoMin,
          espaco: espacos.nome,
          espacoNoCliente: espacos.noLocalDoCliente,
          conteudo: orcamentos.conteudo,
          observacoesOrcamento: orcamentos.observacoes,
          convidadosOrcamento: orcamentos.convidados,
        })
        .from(reservas)
        .leftJoin(tiposEvento, eq(tiposEvento.id, reservas.tipoEventoId))
        .leftJoin(turnos, eq(turnos.id, reservas.turnoId))
        .leftJoin(espacos, eq(espacos.id, reservas.espacoId))
        .leftJoin(orcamentos, eq(orcamentos.id, reservas.orcamentoId))
        .where(
          and(
            eq(reservas.id, reservaId),
            eq(reservas.tipo, 'confirmada'),
            inArray(reservas.status, ['ativa', 'realizada']),
          ),
        )
        .limit(1),
      tx
        .select({
          tipo: orcamentoItens.tipo,
          descricao: orcamentoItens.descricao,
          quantidade: orcamentoItens.quantidade,
          cobranca: opcionais.cobranca,
          modeloPreco: pacotes.modeloPreco,
        })
        .from(orcamentoItens)
        .leftJoin(opcionais, eq(opcionais.id, orcamentoItens.referenciaId))
        .leftJoin(pacotes, eq(pacotes.id, orcamentoItens.referenciaId))
        .where(
          eq(
            orcamentoItens.orcamentoId,
            sql`(select r.orcamento_id from public.reservas r where r.id = ${reservaId})`,
          ),
        )
        .orderBy(asc(orcamentoItens.ordem)),
    ]);
    if (!r) return null;

    const c = (r.conteudo as ConteudoCongelado | null) ?? null;
    const linhaPacote = itens.find((i) => i.tipo === 'pacote');
    const horasExtras = itens
      .filter((i) => i.tipo === 'hora_extra')
      .reduce((n, i) => n + i.quantidade, 0);
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
      : [{ rotulo: 'Convidados', quantidade: r.convidados ?? r.convidadosOrcamento ?? 0 }];

    const ficha = montarFicha({
      buffet: usuario.empresa.nome,
      cliente: r.cliente,
      tipoEvento: r.tipoEvento,
      data: r.data,
      inicio: r.inicio.toISOString(),
      duracaoMin:
        c?.pacote && c.pacote.duracaoInclusaMin > 0
          ? c.pacote.duracaoInclusaMin + horasExtras * 60
          : (r.turnoDuracao ?? 0),
      fuso: usuario.empresa.fuso,
      turno: r.turno,
      convidados,
      espaco:
        c?.espaco ??
        (r.espaco
          ? { nome: r.espaco, noLocalDoCliente: !!r.espacoNoCliente, localCliente: null }
          : null),
      pacote: c?.pacote
        ? { nome: c.pacote.nome, porPessoa: linhaPacote?.modeloPreco === 'por_pessoa' }
        : linhaPacote
          ? { nome: linhaPacote.descricao, porPessoa: linhaPacote.modeloPreco === 'por_pessoa' }
          : null,
      cardapio: c?.pacote?.secoes.map((s) => ({ nome: s.nome, itens: s.itens })) ?? [],
      opcionais: itens
        .filter((i) => i.tipo === 'opcional')
        .map((i) => ({
          nome: i.descricao,
          cobranca: (i.cobranca as CobrancaOpcional | null) ?? null,
          quantidade: i.quantidade,
        })),
      observacoes: [r.observacoes, r.observacoesOrcamento].filter((o): o is string => !!o),
    });
    return { ficha, cliente: r.cliente, data: r.data };
  });
}
