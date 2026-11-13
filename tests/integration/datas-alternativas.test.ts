import { sql as sqlDrizzle } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { hojeNoFuso } from '@/domain/dates';
import { montarPrevia, type Escolhas } from '@/domain/publico';
import { lerUsuario, type UsuarioAtual } from '@/server/auth/sessao';
import { criarComAnon } from '@/server/db/anon';
import { criarDb } from '@/server/db/client';
import { carregarLead } from '@/server/leads/carregar';
import { prepararVersao } from '@/server/proposta/versao';
import { lerContextoPublico } from '@/server/publico/carregar';
import { conectar, IDS, urlBancoTeste } from '../support/db';

/* Fase 6: a 2ª e a 3ª datas do cliente chegam ao buffet no detalhe do lead. */

process.env.DATABASE_URL ??= urlBancoTeste();
const sql = conectar();
const { db, sql: conexao } = criarDb(urlBancoTeste(), { max: 2 });
const comAnon = criarComAnon(db);
const WHATSAPP = '+5534990099001';

afterAll(async () => {
  await sql`delete from public.leads where whatsapp_e164 = ${WHATSAPP}`;
  await sql.end();
  await conexao.end();
});

describe('datas de preferência no lead', () => {
  it('as escolhas com 2 datas extras vão no rascunho e aparecem no orçamento do lead', async () => {
    const contexto = (await lerContextoPublico('buffet-demo', comAnon))!;
    const ctx = contexto.ctx;
    const hoje = hojeNoFuso(contexto.fuso);
    const [d] = await sql`select (current_date + 150)::text as d, (current_date + 157)::text as d2,
      (current_date + 164)::text as d3`;
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
      datasAlternativas: [d!.d2 as string, d!.d3 as string],
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
      clienteNome: 'Cliente Datas',
      buffetNome: 'Buffet Demo',
    });
    // as datas extras não mudam o preço
    expect(v.resultado.totalCentavos).toBe(
      montarPrevia(
        ctx,
        { ...escolhas, datasAlternativas: [] },
        {
          hoje,
          comContato: true,
          modo: 'exato',
        },
      ).resultado!.totalCentavos,
    );
    await comAnon(async (tx) => {
      const [t] = await tx.execute<{ token: string }>(sqlDrizzle`select publico.iniciar_orcamento(
        'buffet-demo', 'Cliente Datas', ${WHATSAPP}, 'v1', 'aceito', 'link_direto'::public.origem_lead,
        '{}'::jsonb, ${tipo.id}, ${escolhas.data}::date, ${turno.id}, ${v.campos.espacoId}, 50, 'ip-datas', false) as token`);
      await tx.execute(sqlDrizzle`select publico.concluir_versao(
        'buffet-demo', ${t!.token}, ${JSON.stringify(v.resultado)}::jsonb, ${JSON.stringify(v.itens)}::jsonb,
        ${v.resultado.totalCentavos}, ${v.validade}::date, ${JSON.stringify(escolhas)}::jsonb,
        ${tipo.id}, ${escolhas.data}::date, ${turno.id}, ${v.campos.espacoId}, 50, ${pacote.id},
        ${JSON.stringify(v.conteudo)}::jsonb) as token`);
    });
    const [lead] = await sql`select id from public.leads where whatsapp_e164 = ${WHATSAPP}`;
    const dono = { ...(await lerUsuario(IDS.donoA))!, suporte: null } as UsuarioAtual;
    const detalhe = await carregarLead(dono, lead!.id as string);
    const versao = detalhe!.orcamentos[0]!.versoes[0]!;
    const f = (x: string) => x.split('-').reverse().join('/');
    expect(versao.datasAlternativas).toBe(
      `Outras datas possíveis: ${f(d!.d2 as string)} e ${f(d!.d3 as string)}`,
    );
  });
});
