import { sql as sqlDrizzle } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hojeNoFuso } from '@/domain/dates';
import { montarPrevia, type Escolhas } from '@/domain/publico';
import { fotosAindaEmUso } from '@/server/catalogo/fotos-em-uso';
import { criarComAnon } from '@/server/db/anon';
import { criarDb } from '@/server/db/client';
import { carregarPropostaPublica } from '@/server/proposta/carregar';
import { gerarPdfProposta } from '@/server/proposta/pdf';
import { prepararVersao, vitrineDoCatalogo } from '@/server/proposta/versao';
import { lerContextoPublico } from '@/server/publico/carregar';
import { comoUsuario, conectar, esperarErroSql, IDS, urlBancoTeste } from '../support/db';

/*
 * Fase 2: fotos em opcionais e nas seções do cardápio. Cada buffet só grava foto no próprio
 * catálogo e só com caminho da própria pasta; a foto congelada numa proposta não some.
 */

const sql = conectar();
const { db, sql: conexao } = criarDb(urlBancoTeste(), { max: 4 });
const comAnon = criarComAnon(db);
const WHATSAPP = '+5534990088001';
const SUPABASE_ANTES = process.env.NEXT_PUBLIC_SUPABASE_URL;
const foto = (empresa: string, n: string) =>
  `${empresa}/pacotes/${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}.webp`;

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9';
});

afterAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ANTES;
  await sql`delete from public.leads where whatsapp_e164 = ${WHATSAPP}`;
  await sql`update public.opcionais set fotos = '[]' where empresa_id = ${IDS.empresaA}`;
  await sql`update public.secoes_cardapio set foto_url = null where empresa_id = ${IDS.empresaA}`;
  await sql.end();
  await conexao.end();
});

async function umOpcional() {
  const [o] = await sql`select id from public.opcionais where empresa_id = ${IDS.empresaA}
    order by ordem limit 1`;
  return o!.id as string;
}

async function umaSecao() {
  const [s] = await sql`select id from public.secoes_cardapio where empresa_id = ${IDS.empresaA}
    order by ordem limit 1`;
  return s!.id as string;
}

describe('fotos do catálogo: cada buffet só no seu', () => {
  it('o dono grava foto da própria pasta no opcional e na seção', async () => {
    const [opcional, secao] = [await umOpcional(), await umaSecao()];
    await comoUsuario(sql, IDS.donoA, async (tx) => {
      const o = await tx`update public.opcionais set fotos = ${tx.json([foto(IDS.empresaA, 'a')])}
        where id = ${opcional} returning fotos`;
      expect(o[0]!.fotos).toEqual([foto(IDS.empresaA, 'a')]);
      const s = await tx`update public.secoes_cardapio set foto_url = ${foto(IDS.empresaA, 'b')}
        where id = ${secao} returning foto_url`;
      expect(s[0]!.foto_url).toBe(foto(IDS.empresaA, 'b'));
    });
  });

  it('um buffet não grava foto em opcional ou seção de outro (RLS)', async () => {
    const [opcional, secao] = [await umOpcional(), await umaSecao()];
    await comoUsuario(sql, IDS.donoB, async (tx) => {
      const o = await tx`update public.opcionais set fotos = ${tx.json([foto(IDS.empresaB, 'a')])}
        where id = ${opcional} returning id`;
      expect(o).toHaveLength(0);
      const s = await tx`update public.secoes_cardapio set foto_url = ${foto(IDS.empresaB, 'b')}
        where id = ${secao} returning id`;
      expect(s).toHaveLength(0);
    });
    const [o] = await sql`select fotos from public.opcionais where id = ${opcional}`;
    expect(o!.fotos).toEqual([]);
  });

  it('o dono não aponta foto da pasta de outro buffet (check no banco)', async () => {
    const [opcional, secao] = [await umOpcional(), await umaSecao()];
    await comoUsuario(sql, IDS.donoA, async (tx) => {
      await esperarErroSql(
        tx.savepoint(
          (s) => s`update public.opcionais set fotos = ${s.json([foto(IDS.empresaB, 'a')])}
            where id = ${opcional}`,
        ),
        '23514',
      );
      await esperarErroSql(
        tx.savepoint(
          (s) => s`update public.secoes_cardapio set foto_url = ${foto(IDS.empresaB, 'b')}
            where id = ${secao}`,
        ),
        '23514',
      );
      await esperarErroSql(
        tx.savepoint(
          (s) => s`update public.opcionais set fotos = ${s.json(['../../etc/passwd'])}
            where id = ${opcional}`,
        ),
        '23514',
      );
    });
  });

  it('vendedor não grava foto no catálogo', async () => {
    const opcional = await umOpcional();
    await comoUsuario(sql, IDS.vendedorA, async (tx) => {
      const o = await tx`update public.opcionais set fotos = ${tx.json([foto(IDS.empresaA, 'c')])}
        where id = ${opcional} returning id`;
      expect(o).toHaveLength(0);
    });
  });
});

describe('fotos do catálogo na proposta', () => {
  it('congela a foto do opcional e da seção; trocar depois não muda a proposta; Storage protegido', async () => {
    const contexto0 = (await lerContextoPublico('buffet-demo', comAnon))!;
    const pacote = contexto0.ctx.pacotes.find((p) => p.nome === 'Super')!;
    const opcional = contexto0.ctx.opcionais.find(
      (o) =>
        o.ativo &&
        !o.pacotesInclusoIds.includes(pacote.id) &&
        (o.pacotesCompativeisIds.length === 0 || o.pacotesCompativeisIds.includes(pacote.id)) &&
        o.cobranca === 'fixo',
    )!;
    const fOpcional = foto(IDS.empresaA, 'd');
    const fSecao = foto(IDS.empresaA, 'e');
    const fSolta = foto(IDS.empresaA, 'f');
    await sql`update public.opcionais set fotos = ${sql.json([fOpcional])} where id = ${opcional.id}`;
    await sql`update public.secoes_cardapio set foto_url = ${fSecao}
      where pacote_id = ${pacote.id} and nome = 'Salgados'`;
    try {
      const contexto = (await lerContextoPublico('buffet-demo', comAnon))!;
      const ctx = contexto.ctx;
      const hoje = hojeNoFuso(contexto.fuso);
      const [d] = await sql`select (current_date + 140)::text as d`;
      const tipo = ctx.tiposEvento[0]!;
      const turno = ctx.turnos.find((t) => t.nome === 'Tarde')!;
      const escolhas: Escolhas = {
        tipoEventoId: tipo.id,
        data: d!.d as string,
        turnoId: turno.id,
        adultos: 50,
        criancas: [],
        pacoteId: pacote.id,
        opcionais: [{ opcionalId: opcional.id, quantidade: 1 }],
        horasExtras: 0,
      };
      const { resultado } = montarPrevia(ctx, escolhas, {
        hoje,
        comContato: true,
        modo: 'exato',
      });
      expect(resultado?.ok).toBe(true);
      const v = prepararVersao({
        ctx,
        escolhas,
        resultado: resultado!,
        hoje,
        textos: contexto.textos,
        aberturaModelo: null,
        clienteNome: 'Cliente Fotos',
        buffetNome: 'Buffet Demo',
        vitrine: vitrineDoCatalogo(contexto.fotosCatalogo),
      });
      const token = await comAnon(async (tx) => {
        const [t] = await tx.execute<{ token: string }>(sqlDrizzle`select publico.iniciar_orcamento(
          'buffet-demo', 'Cliente Fotos', ${WHATSAPP}, 'v1', 'aceito', 'link_direto'::public.origem_lead,
          '{}'::jsonb, ${tipo.id}, ${escolhas.data}::date, ${turno.id}, ${v.campos.espacoId}, 50, 'ip-fotos', false) as token`);
        const [c] = await tx.execute<{ token: string }>(sqlDrizzle`select publico.concluir_versao(
          'buffet-demo', ${t!.token}, ${JSON.stringify(v.resultado)}::jsonb, ${JSON.stringify(v.itens)}::jsonb,
          ${v.resultado.totalCentavos}, ${v.validade}::date, ${JSON.stringify(escolhas)}::jsonb,
          ${tipo.id}, ${escolhas.data}::date, ${turno.id}, ${v.campos.espacoId}, 50, ${pacote.id},
          ${JSON.stringify(v.conteudo)}::jsonb) as token`);
        return c!.token;
      });

      const url = (c: string) => `http://127.0.0.1:9/storage/v1/object/public/midia/${c}`;
      const p1 = await carregarPropostaPublica('buffet-demo', token, comAnon);
      const linha = p1!.modelo.investimento.linhas.find((l) => l.descricao === opcional.nome)!;
      expect(linha.foto).toBe(url(fOpcional));
      expect(p1!.modelo.cardapio!.secoes.find((s) => s.nome === 'Salgados')!.foto).toBe(
        url(fSecao),
      );

      // o dono tira as fotos: a proposta continua igual e os arquivos ficam no Storage
      await sql`update public.opcionais set fotos = '[]' where id = ${opcional.id}`;
      await sql`update public.secoes_cardapio set foto_url = null where pacote_id = ${pacote.id}`;
      const p2 = await carregarPropostaPublica('buffet-demo', token, comAnon);
      expect(p2!.modelo).toEqual(p1!.modelo);
      const emUso = await db.transaction((tx) => fotosAindaEmUso(tx, [fOpcional, fSecao, fSolta]));
      expect([...emUso].sort()).toEqual([fOpcional, fSecao].sort());

      // a foto não abre (porta fechada): o PDF sai sem ela, sem erro
      const pdf = await gerarPdfProposta(p2!.modelo);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      await sql`delete from public.leads where whatsapp_e164 = ${WHATSAPP}`;
      await sql`update public.opcionais set fotos = '[]' where id = ${opcional.id}`;
      await sql`update public.secoes_cardapio set foto_url = null where pacote_id = ${pacote.id}`;
    }
  });

  it('fotosAindaEmUso acha as fotos ainda usadas no catálogo', async () => {
    const opcional = await umOpcional();
    const secao = await umaSecao();
    const [pacote] = await sql`select id, fotos from public.pacotes
      where empresa_id = ${IDS.empresaA} limit 1`;
    const [fp, fo, fs, livre] = ['1', '2', '3', '4'].map((n) => foto(IDS.empresaA, n));
    await sql.begin(async (tx) => {
      await tx`update public.pacotes set fotos = ${tx.json([fp!])} where id = ${pacote!.id}`;
      await tx`update public.opcionais set fotos = ${tx.json([fo!])} where id = ${opcional}`;
      await tx`update public.secoes_cardapio set foto_url = ${fs!} where id = ${secao}`;
    });
    try {
      const emUso = await db.transaction((tx) => fotosAindaEmUso(tx, [fp!, fo!, fs!, livre!]));
      expect([...emUso].sort()).toEqual([fp, fo, fs].sort());
      expect(await db.transaction((tx) => fotosAindaEmUso(tx, []))).toEqual(new Set());
    } finally {
      await sql`update public.pacotes set fotos = ${sql.json(pacote!.fotos as string[])}
        where id = ${pacote!.id}`;
      await sql`update public.opcionais set fotos = '[]' where id = ${opcional}`;
      await sql`update public.secoes_cardapio set foto_url = null where id = ${secao}`;
    }
  });
});
