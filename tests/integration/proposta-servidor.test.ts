import { sql as sqlDrizzle } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { hojeNoFuso } from '@/domain/dates';
import { textoDoModelo } from '@/domain/proposta';
import { montarPrevia, type Escolhas } from '@/domain/publico';
import { criarComAnon } from '@/server/db/anon';
import { criarDb } from '@/server/db/client';
import { carregarPropostaPublica } from '@/server/proposta/carregar';
import { gerarPdfProposta } from '@/server/proposta/pdf';
import { prepararVersao } from '@/server/proposta/versao';
import { lerContextoPublico } from '@/server/publico/carregar';
import { conectar, IDS, urlBancoTeste } from '../support/db';

const sql = conectar();
const { db, sql: conexao } = criarDb(urlBancoTeste(), { max: 4 });
const comAnon = criarComAnon(db);
afterAll(async () => {
  await sql.end();
  await conexao.end();
});

/** Conclui uma proposta real do Buffet Demo pelo mesmo caminho do servidor (motor + congelamento). */
async function concluirNoDemo(observacoes?: string) {
  const contexto = (await lerContextoPublico('buffet-demo', comAnon))!;
  const ctx = contexto.ctx;
  const hoje = hojeNoFuso(contexto.fuso);
  const [d] = await sql`select (current_date + 120)::text as d`;
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
    aberturaModelo: contexto.aberturaPorTipo[tipo.id] ?? null,
    clienteNome: 'Paula Teste',
    buffetNome: 'Buffet Demo',
  });
  const token = await comAnon(async (tx) => {
    const [t] = await tx.execute<{ token: string }>(sqlDrizzle`select publico.iniciar_orcamento(
      'buffet-demo', 'Paula Teste', '+5534990066001', 'v1', 'aceito', 'link_direto'::public.origem_lead,
      '{}'::jsonb, ${tipo.id}, ${escolhas.data}::date, ${turno.id}, ${v.campos.espacoId}, 50, 'ip-pdf', false) as token`);
    const [c] = await tx.execute<{ token: string }>(sqlDrizzle`select publico.concluir_versao(
      'buffet-demo', ${t!.token}, ${JSON.stringify(v.resultado)}::jsonb, ${JSON.stringify(v.itens)}::jsonb,
      ${v.resultado.totalCentavos}, ${v.validade}::date, ${JSON.stringify(escolhas)}::jsonb,
      ${tipo.id}, ${escolhas.data}::date, ${turno.id}, ${v.campos.espacoId}, 50, ${pacote.id},
      ${JSON.stringify(v.conteudo)}::jsonb) as token`);
    return c!.token;
  });
  if (observacoes)
    await sql`update public.orcamentos set observacoes = ${observacoes} where token = ${token}`;
  return { token, pacoteId: pacote.id };
}

describe('proposta: congelamento, web e PDF', () => {
  it('mudar preço e cardápio do catálogo depois de concluir não altera a proposta', async () => {
    const { token, pacoteId } = await concluirNoDemo();
    try {
      const antes = await carregarPropostaPublica('buffet-demo', token, comAnon);
      expect(antes!.modelo.cardapio?.secoes.length).toBeGreaterThan(0);
      expect(antes!.modelo.abertura).toContain('Paula');
      await sql
        .begin(async (tx) => {
          await tx`update public.pacotes set nome = 'Super Mudado' where id = ${pacoteId}`;
          await tx`update public.faixas_preco set valor_centavos = valor_centavos * 2 where pacote_id = ${pacoteId}`;
          await tx`update public.secoes_cardapio set itens = '{"Item novo"}' where pacote_id = ${pacoteId}`;
          await tx`update public.regras_comerciais set cancelamento_texto = 'MUDOU' where empresa_id = ${IDS.empresaA}`;
          const depois = await carregarPropostaPublica('buffet-demo', token, comAnon);
          expect(textoDoModelo(depois!.modelo)).toBe(textoDoModelo(antes!.modelo));
          throw new Error('desfazer');
        })
        .catch((e) => {
          if ((e as Error).message !== 'desfazer') throw e;
        });
    } finally {
      await sql`delete from public.leads where whatsapp_e164 = '+5534990066001'`;
    }
  });

  it('PDF do Buffet Demo: válido, rápido e leve', async () => {
    const { token } = await concluirNoDemo('Observação para o PDF.');
    try {
      const p = await carregarPropostaPublica('buffet-demo', token, comAnon);
      await gerarPdfProposta(p!.modelo); // aquecimento (fontes)
      const inicio = performance.now();
      const pdf = await gerarPdfProposta(p!.modelo);
      const ms = performance.now() - inicio;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeLessThan(500 * 1024);
      expect(ms).toBeLessThan(2000);
      console.info(`[pdf] ${ms.toFixed(0)} ms, ${(pdf.length / 1024).toFixed(1)} kB`);
    } finally {
      await sql`delete from public.leads where whatsapp_e164 = '+5534990066001'`;
    }
  });

  it('dados internos nunca chegam ao modelo da web/PDF', async () => {
    const { token } = await concluirNoDemo();
    try {
      await sql`update public.orcamentos set observacoes_internas = 'SEGREDO-PDF-789',
        desconto_motivo = 'MOTIVO-PDF-012' where token = ${token}`;
      const p = await carregarPropostaPublica('buffet-demo', token, comAnon);
      const texto = textoDoModelo(p!.modelo) + JSON.stringify(p!.versao) + JSON.stringify(p!.meta);
      expect(texto).not.toContain('SEGREDO-PDF-789');
      expect(texto).not.toContain('MOTIVO-PDF-012');
    } finally {
      await sql`delete from public.leads where whatsapp_e164 = '+5534990066001'`;
    }
  });
});
