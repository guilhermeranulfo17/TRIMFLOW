import 'server-only';
import { sql } from 'drizzle-orm';
import { contaApresentacao, type ContaApresentacao } from '@/domain/apresentacao/contas';
import { contratoDeExemplo } from '@/domain/contratos/exemplo';
import { VERSAO_DOCUMENTOS } from '@/domain/legal/versao';
import { modeloDaChave } from '@/domain/modelos';
import { gravarModelo } from '@/server/catalogo/gravar-modelo';
import type { Db } from '@/server/db/client';
import { preambuloUsuario } from '@/server/db/tenant';
import type { AuthDemo } from '@/server/demo/recriar';

/*
 * Contas de apresentação (uma por modelo de negócio): a equipe Orkestra mostra o sistema em
 * chamada de vídeo. Conta comum (editável), de cortesia, com dados fictícios; criada ou recriada
 * do zero só pelo /interno. Mesmo caminho da demo: empresa e dono (apresentacao_criar), catálogo
 * do modelo com o RLS do dono (gravarModelo) e os dados (apresentacao_popular), numa transação.
 */

export type DepsApresentacao = { db: Db; auth: AuthDemo };

export type SituacaoApresentacao = {
  conta: ContaApresentacao;
  empresaId: string | null;
  usuarioId: string | null;
  leads: number;
  criadaEm: Date | null;
};

/** As quatro contas e se já existem (para o /interno). */
export async function listarApresentacoes(
  db: Db,
  contas: readonly ContaApresentacao[],
): Promise<SituacaoApresentacao[]> {
  const linhas = (await db.execute(sql`
    select e.id, e.slug, e.criado_em,
      (select u.id from public.usuarios u where u.empresa_id = e.id and u.perfil = 'dono'
        and u.ativo order by u.criado_em limit 1) as usuario_id,
      (select count(*) from public.leads l where l.empresa_id = e.id)::int as leads
    from public.empresas e where e.eh_apresentacao`)) as unknown as {
    id: string;
    slug: string;
    criado_em: Date | string;
    usuario_id: string | null;
    leads: number;
  }[];
  return contas.map((conta) => {
    const l = linhas.find((x) => x.slug === conta.slug);
    return {
      conta,
      empresaId: l?.id ?? null,
      usuarioId: l?.usuario_id ?? null,
      leads: Number(l?.leads ?? 0),
      criadaEm: l ? new Date(l.criado_em) : null,
    };
  });
}

/** Cria (ou apaga e cria de novo) a conta do modelo. */
export async function criarApresentacao(
  d: DepsApresentacao,
  chave: string,
): Promise<{ empresaId: string; leads: number }> {
  const conta = contaApresentacao(chave);
  if (!conta) throw new Error('APRESENTACAO_MODELO_INVALIDO');
  const usuarioId = await d.auth.garantirUsuario(conta.email);
  return d.db.transaction(async (tx) => {
    const [r] = (await tx.execute(sql`
      select public.apresentacao_criar(${conta.slug}, ${conta.segmento}::public.segmento_empresa,
        ${conta.nome}, ${conta.cidade}, ${conta.sobre}, ${conta.slogan},
        array(select jsonb_array_elements_text(${JSON.stringify(conta.diferenciais)}::jsonb)),
        ${usuarioId}::uuid, ${conta.email}, ${conta.usuarioNome}, ${VERSAO_DOCUMENTOS}) as id`)) as unknown as {
      id: string;
    }[];
    const empresaId = r!.id;

    // o catálogo entra como o dono (RLS e triggers do cadastro), ainda na montagem
    await tx.execute(sql.raw(preambuloUsuario(usuarioId, null)));
    const gravado = await gravarModelo(
      async (_id, fn) => fn(tx),
      usuarioId,
      empresaId,
      modeloDaChave(conta.chave),
    );
    if (!gravado.ok) throw new Error('APRESENTACAO_CATALOGO');
    await tx.execute(sql`reset role`);
    await tx.execute(sql`select set_config('request.jwt.claims', '', true)`);

    const [p] = (await tx.execute(
      sql`select public.apresentacao_popular(${empresaId}::uuid) as n`,
    )) as unknown as { n: number }[];

    // um contrato já assinado, da primeira festa confirmada
    const [rx] = (await tx.execute(sql`
      select r.id, r.cliente_nome, r.cliente_whatsapp_e164, r.data::text as data, r.convidados,
        coalesce(r.valor_total_centavos, 0) as total, coalesce(r.sinal_centavos, 0) as sinal,
        e.nome as buffet, (now() at time zone e.fuso)::date::text as hoje,
        t.nome as tipo, tu.hora_inicio::text as hora, tu.duracao_min, es.nome as espaco,
        o.conteudo -> 'pacote' ->> 'nome' as pacote
      from public.reservas r
      join public.empresas e on e.id = r.empresa_id
      left join public.tipos_evento t on t.id = r.tipo_evento_id
      left join public.turnos tu on tu.id = r.turno_id
      left join public.espacos es on es.id = r.espaco_id
      left join public.orcamentos o on o.id = r.orcamento_id
      where r.empresa_id = ${empresaId}::uuid and r.tipo = 'confirmada' and r.status = 'ativa'
        and r.lead_id is not null and coalesce(r.valor_total_centavos, 0) > 0
      order by r.data limit 1`)) as unknown as {
      id: string;
      cliente_nome: string;
      cliente_whatsapp_e164: string | null;
      data: string;
      convidados: number | null;
      total: number;
      sinal: number;
      buffet: string;
      hoje: string;
      tipo: string | null;
      hora: string | null;
      duracao_min: number | null;
      espaco: string | null;
      pacote: string | null;
    }[];
    if (rx) {
      const c = contratoDeExemplo({
        buffet: rx.buffet,
        cliente: rx.cliente_nome,
        whatsappE164: rx.cliente_whatsapp_e164,
        data: rx.data,
        convidados: rx.convidados,
        totalCentavos: Number(rx.total),
        sinalCentavos: Number(rx.sinal),
        hoje: rx.hoje,
        segmento: conta.segmento,
        festa: {
          ...(rx.tipo ? { tipoEvento: rx.tipo } : {}),
          ...(rx.hora ? { horaInicio: rx.hora.slice(0, 5) } : {}),
          ...(rx.duracao_min ? { duracaoMin: Number(rx.duracao_min) } : {}),
          ...(rx.espaco ? { espaco: rx.espaco } : {}),
          ...(rx.pacote ? { pacote: rx.pacote, itens: [`Pacote ${rx.pacote}`] } : {}),
          naoIncluso: 'Bebidas alcoólicas e decoração floral.',
        },
      });
      const dados = {
        reserva_id: rx.id,
        titulo: c.titulo,
        texto: c.texto,
        valores: c.valores,
        modelo_origem: c.modeloOrigem,
        cliente: rx.cliente_nome,
      };
      await tx.execute(
        sql`select public.apresentacao_contrato_exemplo(${empresaId}::uuid, ${JSON.stringify(dados)}::jsonb)`,
      );
    }
    return { empresaId, leads: Number(p?.n ?? 0) };
  });
}
