import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { contextoDoModelo, MODELOS, REGRAS_EXEMPLO } from '@/domain/modelos';
import { calcularOrcamento, type ContextoPreco } from '@/domain/preco';
import { SEGMENTOS } from '@/domain/segmento';
import { carregarContexto } from '@/server/catalogo/carregar';
import { gravarModelo } from '@/server/catalogo/gravar-modelo';
import { criarDb } from '@/server/db/client';
import { criarComUsuario } from '@/server/db/tenant';
import { conectar, IDS, urlBancoTeste } from '../support/db';
import {
  criarEmpresaTemporaria,
  removerEmpresa,
  type EmpresaTemporaria,
} from '../support/empresa-temporaria';

const sql = conectar();
const { db, sql: sqlDrizzle } = criarDb(urlBancoTeste(), { max: 4 });
const comUsuario = criarComUsuario(db);
const temporarias: EmpresaTemporaria[] = [];

async function nova(segmento: 'infantil' | 'eventos' | 'domicilio') {
  const e = await criarEmpresaTemporaria(sql, segmento);
  temporarias.push(e);
  return e;
}

afterEach(async () => {
  while (temporarias.length > 0) await removerEmpresa(sql, temporarias.pop()!);
});
afterAll(async () => {
  await sql.end();
  await sqlDrizzle.end();
});

/** Troca ids por nomes para comparar contextos vindos do banco e do modelo. */
function normalizar(c: ContextoPreco) {
  const nome = (lista: { id: string; nome: string }[], id: string | null) =>
    id === null ? null : (lista.find((x) => x.id === id)?.nome ?? `?${id}`);
  const nomes = (lista: { id: string; nome: string }[], ids: string[]) =>
    ids.map((id) => nome(lista, id)).sort();
  return {
    regras: c.regras,
    tiposEvento: c.tiposEvento.map(({ id: _id, ...r }) => r),
    espacos: c.espacos.map(({ id: _id, ...r }) => r),
    turnos: c.turnos.map(({ id: _id, ...r }) => r),
    ajustesDia: c.ajustesDia
      .map(({ id: _id, turnoId, ...r }) => ({ ...r, turno: nome(c.turnos, turnoId) }))
      .sort((a, b) => (a.diaSemana ?? -1) - (b.diaSemana ?? -1)),
    feriados: c.feriados,
    faixasIdade: c.faixasIdade.map(({ id: _id, pacoteId, ...r }) => ({
      ...r,
      pacote: nome(c.pacotes, pacoteId),
    })),
    pacotes: c.pacotes.map(({ id: _id, tiposEventoIds, ...r }) => ({
      ...r,
      tipos: nomes(c.tiposEvento, tiposEventoIds),
    })),
    opcionais: c.opcionais.map(
      ({ id: _id, pacotesCompativeisIds, pacotesInclusoIds, tiposEventoIds, ...r }) => ({
        ...r,
        compativeis: nomes(c.pacotes, pacotesCompativeisIds),
        inclusos: nomes(c.pacotes, pacotesInclusoIds),
        tipos: nomes(c.tiposEvento, tiposEventoIds),
      }),
    ),
    faixasDeslocamento: c.faixasDeslocamento,
  };
}

describe('carregarContexto', () => {
  it('seed do Buffet Demo é igual ao modelo infantil', async () => {
    const doBanco = await carregarContexto(IDS.donoA, comUsuario);
    expect(doBanco).not.toBeNull();
    expect(normalizar(doBanco!)).toEqual(normalizar(contextoDoModelo(MODELOS.infantil)));
    const [regras] =
      await sql`select formas_pagamento, condicoes_texto, nao_incluso_texto, cancelamento_texto,
      prazo_pre_reserva_horas from public.regras_comerciais where empresa_id = ${IDS.empresaA}`;
    expect(regras).toEqual({
      formas_pagamento: REGRAS_EXEMPLO.formasPagamento,
      condicoes_texto: REGRAS_EXEMPLO.condicoesTexto,
      nao_incluso_texto: REGRAS_EXEMPLO.naoInclusoTexto,
      cancelamento_texto: REGRAS_EXEMPLO.cancelamentoTexto,
      prazo_pre_reserva_horas: REGRAS_EXEMPLO.prazoPreReservaHoras,
    });
  });

  it('vendedor carrega o mesmo catálogo; dono de B não vê o de A', async () => {
    const vendedor = await carregarContexto(IDS.vendedorA, comUsuario);
    expect(vendedor?.pacotes).toHaveLength(3);
    const b = await carregarContexto(IDS.donoB, comUsuario);
    expect(b?.pacotes).toEqual([]);
    expect(b?.regras.sinalBp).toBe(3000);
  });

  it('dados gravados no banco reproduzem o teste de aceitação até o centavo', async () => {
    const e = await nova('infantil');
    const id = e.empresaId;
    await sql.begin(async (tx) => {
      const [tipo] =
        await tx`insert into public.tipos_evento (empresa_id, nome) values (${id}, 'Aniversário infantil') returning id`;
      await tx`insert into public.espacos (empresa_id, nome, capacidade_max) values (${id}, 'Salão', 120)`;
      await tx`insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana)
               values (${id}, 'Tarde', '15:00', 240, '{0,1,2,3,4,5,6}')`;
      await tx`insert into public.ajustes_dia (empresa_id, tipo, dia_semana, ajuste_bp) values (${id}, 'dia_semana', 6, 1000)`;
      await tx`insert into public.faixas_idade (empresa_id, rotulo, idade_min, idade_max, fator_bp) values
               (${id}, '0 a 5 anos', 0, 5, 0), (${id}, '6 a 10 anos', 6, 10, 5000)`;
      const [pacote] =
        await tx`insert into public.pacotes (empresa_id, nome, modelo_preco, valor_excedente_centavos,
                 min_convidados, max_convidados, valor_hora_extra_centavos)
               values (${id}, 'Super', 'por_faixa', 8500, 20, 120, 45000) returning id`;
      await tx`insert into public.faixas_preco (empresa_id, pacote_id, ate_convidados, valor_centavos)
               values (${id}, ${pacote!.id}, 50, 450000)`;
      await tx`insert into public.pacote_tipos_evento (empresa_id, pacote_id, tipo_evento_id)
               values (${id}, ${pacote!.id}, ${tipo!.id})`;
      await tx`insert into public.opcionais (empresa_id, nome, cobranca, preco_centavos) values (${id}, 'Mesa temática', 'fixo', 60000)`;
    });

    const ctx = (await carregarContexto(e.donoId, comUsuario))!;
    const porNome = <T extends { nome: string; id: string }>(l: T[], n: string) =>
      l.find((x) => x.nome === n)!.id;
    const faixa = (rotulo: string) => ctx.faixasIdade.find((f) => f.rotulo === rotulo)!.id;
    const r = calcularOrcamento(ctx, {
      canal: 'interno',
      hoje: '2026-09-30',
      tipoEventoId: porNome(ctx.tiposEvento, 'Aniversário infantil'),
      data: '2026-11-14',
      turnoId: porNome(ctx.turnos, 'Tarde'),
      espacoId: porNome(ctx.espacos, 'Salão'),
      adultos: 60,
      criancas: [
        { faixaIdadeId: faixa('0 a 5 anos'), quantidade: 10 },
        { faixaIdadeId: faixa('6 a 10 anos'), quantidade: 10 },
      ],
      pacoteId: porNome(ctx.pacotes, 'Super'),
      opcionais: [{ opcionalId: porNome(ctx.opcionais, 'Mesa temática'), quantidade: 1 }],
      horasExtras: 1,
      desconto: { tipo: 'percentual', bp: 500 },
      limiteDescontoBp: 1000,
    });
    expect(r.ok).toBe(true);
    expect(r.convidadosEquivalentes).toBe(65);
    expect(r.linhas.map((l) => l.subtotalCentavos)).toEqual([577500, 57750, 60000, 45000, -37013]);
    expect(r.subtotalCentavos).toBe(740250);
    expect(r.totalCentavos).toBe(703237);
    expect(r.sinalCentavos).toBe(210971);
    expect(r.saldoCentavos).toBe(492266);
  });
});

describe('gravarModelo', () => {
  it.each(SEGMENTOS)('grava o modelo %s completo e fiel ao modelo', async (segmento) => {
    const e = await nova(segmento);
    const r = await gravarModelo(comUsuario, e.donoId, e.empresaId, MODELOS[segmento]);
    expect(r).toEqual({
      ok: true,
      pacotes: 3,
      opcionais: MODELOS[segmento].opcionais.length,
    });
    const ctx = await carregarContexto(e.donoId, comUsuario);
    expect(normalizar(ctx!)).toEqual(normalizar(contextoDoModelo(MODELOS[segmento])));
    const [aud] = await sql`select acao, dados from public.auditoria
      where empresa_id = ${e.empresaId} and acao = 'catalogo.modelo_aplicado'`;
    expect(aud?.dados).toMatchObject({ segmento, pacotes: 3 });
  });

  it('recusa quando a empresa já tem pacote (nunca sobrescreve)', async () => {
    const e = await nova('eventos');
    expect((await gravarModelo(comUsuario, e.donoId, e.empresaId, MODELOS.eventos)).ok).toBe(true);
    const segunda = await gravarModelo(comUsuario, e.donoId, e.empresaId, MODELOS.infantil);
    expect(segunda).toEqual({ ok: false, motivo: 'ja_tem_catalogo' });
    const [n] =
      await sql`select count(*)::int as n from public.pacotes where empresa_id = ${e.empresaId}`;
    expect(n?.n).toBe(3);
  });

  it('dois pedidos simultâneos gravam o modelo uma única vez', async () => {
    const e = await nova('domicilio');
    const resultados = await Promise.all([
      gravarModelo(comUsuario, e.donoId, e.empresaId, MODELOS.domicilio),
      gravarModelo(comUsuario, e.donoId, e.empresaId, MODELOS.domicilio),
    ]);
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const [n] =
      await sql`select count(*)::int as n from public.pacotes where empresa_id = ${e.empresaId}`;
    expect(n?.n).toBe(3);
  });

  it('vendedor não grava (RLS) e nada fica pela metade', async () => {
    const e = await nova('infantil');
    await expect(
      gravarModelo(comUsuario, e.vendedorId, e.empresaId, MODELOS.infantil),
    ).rejects.toThrow();
    const [n] =
      await sql`select count(*)::int as n from public.tipos_evento where empresa_id = ${e.empresaId}`;
    expect(n?.n).toBe(0);
  });

  it('não grava em outra empresa', async () => {
    const e = await nova('infantil');
    await expect(
      gravarModelo(comUsuario, IDS.donoB, e.empresaId, MODELOS.infantil),
    ).rejects.toThrow();
  });
});
