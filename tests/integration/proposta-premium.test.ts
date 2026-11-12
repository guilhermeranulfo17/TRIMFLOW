import { sql as sqlDrizzle } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hojeNoFuso } from '@/domain/dates';
import { montarPrevia, type Escolhas } from '@/domain/publico';
import { criarComAnon } from '@/server/db/anon';
import { criarDb } from '@/server/db/client';
import { carregarPropostaPublica } from '@/server/proposta/carregar';
import { gerarPdfProposta } from '@/server/proposta/pdf';
import { prepararVersao, vitrinePacotesDe } from '@/server/proposta/versao';
import { lerContextoPublico } from '@/server/publico/carregar';
import { comoUsuario, conectar, esperarErroSql, IDS, urlBancoTeste } from '../support/db';

/*
 * Proposta premium: modelo visual (escolha do dono, padrão pelo segmento, ao vivo) e foto do
 * pacote congelada na versão (o PDF da versão emitida mostra sempre a mesma foto).
 */

const sql = conectar();
const { db, sql: conexao } = criarDb(urlBancoTeste(), { max: 4 });
const comAnon = criarComAnon(db);
const WHATSAPP = '+5534990077001';
const SUPABASE_ANTES = process.env.NEXT_PUBLIC_SUPABASE_URL;

beforeAll(() => {
  // URL pública da mídia apontando para uma porta fechada: o PDF tenta baixar e segue sem foto.
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9';
});

afterAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ANTES;
  await sql`delete from public.leads where whatsapp_e164 = ${WHATSAPP}`;
  await sql`update public.empresas set modelo_proposta = null where id = ${IDS.empresaA}`;
  await sql.end();
  await conexao.end();
});

/** Conclui uma proposta do Buffet Demo pelo caminho do servidor, com a vitrine dos pacotes. */
async function concluirComFoto() {
  const contexto = (await lerContextoPublico('buffet-demo', comAnon))!;
  const ctx = contexto.ctx;
  const hoje = hojeNoFuso(contexto.fuso);
  const [d] = await sql`select (current_date + 130)::text as d`;
  const tipo = ctx.tiposEvento[0]!;
  const turno = ctx.turnos.find((t) => t.nome === 'Tarde')!;
  const pacote = ctx.pacotes.find((p) => p.nome === 'Super')!;
  const escolhas: Escolhas = {
    tipoEventoId: tipo.id,
    data: d!.d as string,
    turnoId: turno.id,
    adultos: 50,
    criancas: [],
    pacoteId: pacote.id,
    opcionais: [],
    horasExtras: 0,
  };
  const { resultado } = montarPrevia(ctx, escolhas, { hoje, comContato: true, modo: 'exato' });
  expect(resultado?.ok).toBe(true);
  const v = prepararVersao({
    ctx,
    escolhas,
    resultado: resultado!,
    hoje,
    textos: contexto.textos,
    aberturaModelo: null,
    clienteNome: 'Noiva Teste',
    buffetNome: 'Buffet Demo',
    vitrinePacotes: vitrinePacotesDe(contexto.extras),
  });
  const token = await comAnon(async (tx) => {
    const [t] = await tx.execute<{ token: string }>(sqlDrizzle`select publico.iniciar_orcamento(
      'buffet-demo', 'Noiva Teste', ${WHATSAPP}, 'v1', 'aceito', 'link_direto'::public.origem_lead,
      '{}'::jsonb, ${tipo.id}, ${escolhas.data}::date, ${turno.id}, ${v.campos.espacoId}, 50, 'ip-premium', false) as token`);
    const [c] = await tx.execute<{ token: string }>(sqlDrizzle`select publico.concluir_versao(
      'buffet-demo', ${t!.token}, ${JSON.stringify(v.resultado)}::jsonb, ${JSON.stringify(v.itens)}::jsonb,
      ${v.resultado.totalCentavos}, ${v.validade}::date, ${JSON.stringify(escolhas)}::jsonb,
      ${tipo.id}, ${escolhas.data}::date, ${turno.id}, ${v.campos.espacoId}, 50, ${pacote.id},
      ${JSON.stringify(v.conteudo)}::jsonb) as token`);
    return c!.token;
  });
  return { token, pacoteId: pacote.id };
}

describe('proposta premium', () => {
  it('foto do pacote congela na versão: trocar a foto depois não muda a proposta', async () => {
    const [antes] = await sql`select id, fotos from public.pacotes
      where empresa_id = ${IDS.empresaA} and nome = 'Super'`;
    const caminho = `${IDS.empresaA}/pacotes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
    await sql`update public.pacotes set fotos = ${sql.json([caminho])} where id = ${antes!.id}`;
    try {
      const { token } = await concluirComFoto();
      const p1 = await carregarPropostaPublica('buffet-demo', token, comAnon);
      const linha = p1!.modelo.investimento.linhas.find((l) => l.tipo === 'pacote')!;
      expect(linha.foto).toBe(`http://127.0.0.1:9/storage/v1/object/public/midia/${caminho}`);

      // o dono troca a foto do pacote: a versão emitida continua com a mesma
      await sql`update public.pacotes set fotos = '[]'::jsonb where id = ${antes!.id}`;
      const p2 = await carregarPropostaPublica('buffet-demo', token, comAnon);
      expect(p2!.modelo.investimento.linhas.find((l) => l.tipo === 'pacote')!.foto).toBe(
        linha.foto,
      );

      // a foto não abre (porta fechada): o PDF sai sem ela, sem erro
      const pdf = await gerarPdfProposta(p2!.modelo);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.toString('latin1')).not.toMatch(/\/DCTDecode/);
    } finally {
      await sql`update public.pacotes set fotos = ${sql.json(antes!.fotos as string[])}
        where id = ${antes!.id}`;
      await sql`delete from public.leads where whatsapp_e164 = ${WHATSAPP}`;
    }
  });

  it('modelo visual: padrão do segmento e escolha do dono, valendo ao vivo na proposta', async () => {
    const { token } = await concluirComFoto();
    try {
      // Buffet Demo é infantil: sem escolha, alegre
      const padrao = await carregarPropostaPublica('buffet-demo', token, comAnon);
      expect(padrao!.modelo.visual).toBe('alegre');

      await sql`update public.empresas set modelo_proposta = 'elegante' where id = ${IDS.empresaA}`;
      const escolhido = await carregarPropostaPublica('buffet-demo', token, comAnon);
      expect(escolhido!.modelo.visual).toBe('elegante');
      const pdf = await gerarPdfProposta(escolhido!.modelo);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      // elegante tem capa: ao menos duas páginas
      expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThan(
        1,
      );
    } finally {
      await sql`update public.empresas set modelo_proposta = null where id = ${IDS.empresaA}`;
      await sql`delete from public.leads where whatsapp_e164 = ${WHATSAPP}`;
    }
  });

  it('proposta antiga (sem foto no conteúdo, ou conteúdo nulo) abre e gera PDF nos dois modelos', async () => {
    const { token } = await concluirComFoto();
    try {
      // como uma versão emitida antes da proposta premium: pacote sem descricao/foto
      await sql`update public.orcamentos
        set conteudo = jsonb_set(conteudo, '{pacote}', (conteudo->'pacote') - 'foto' - 'descricao')
        where token = ${token}`;
      for (const modelo of ['elegante', 'alegre', null]) {
        await sql`update public.empresas set modelo_proposta = ${modelo} where id = ${IDS.empresaA}`;
        const p = await carregarPropostaPublica('buffet-demo', token, comAnon);
        expect(p!.modelo.investimento.linhas.every((l) => l.foto === null)).toBe(true);
        const pdf = await gerarPdfProposta(p!.modelo);
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      }
      // versão da Etapa 4: conteúdo nulo
      await sql`update public.orcamentos set conteudo = null where token = ${token}`;
      const etapa4 = await carregarPropostaPublica('buffet-demo', token, comAnon);
      expect(etapa4!.modelo.cardapio).toBeNull();
      const pdf = await gerarPdfProposta(etapa4!.modelo);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      await sql`update public.empresas set modelo_proposta = null where id = ${IDS.empresaA}`;
      await sql`delete from public.leads where whatsapp_e164 = ${WHATSAPP}`;
    }
  });

  it('só o dono troca o modelo, e só para valores válidos', async () => {
    await comoUsuario(sql, IDS.donoA, async (tx) => {
      const r = await tx`update public.empresas set modelo_proposta = 'elegante'
        where id = ${IDS.empresaA} returning modelo_proposta`;
      expect(r[0]!.modelo_proposta).toBe('elegante');
      await esperarErroSql(
        tx.savepoint(
          (s) => s`update public.empresas set modelo_proposta = 'neon'
          where id = ${IDS.empresaA}`,
        ),
        '23514',
      );
      // outra empresa: o RLS não deixa nem ver
      const outra = await tx`update public.empresas set modelo_proposta = 'alegre'
        where id = ${IDS.empresaB} returning id`;
      expect(outra).toHaveLength(0);
    });
    await comoUsuario(sql, IDS.vendedorA, async (tx) => {
      const r = await tx`update public.empresas set modelo_proposta = 'elegante'
        where id = ${IDS.empresaA} returning id`;
      expect(r).toHaveLength(0);
    });
    const [e] = await sql`select modelo_proposta from public.empresas where id = ${IDS.empresaA}`;
    expect(e!.modelo_proposta).toBeNull();
  });
});
