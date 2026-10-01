import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { inserirCatalogoMinimo, TABELAS_CATALOGO } from '../support/catalogo';
import {
  assumirAnon,
  assumirUsuario,
  conectar,
  emTransacao,
  esperarErroSql,
  IDS,
} from '../support/db';

const sql = conectar();
afterAll(() => sql.end());

/** Transação desfeita no final, com um catálogo mínimo em A e em B. */
function comCatalogos<T>(fn: (tx: postgres.TransactionSql) => Promise<T>) {
  return emTransacao(sql, async (tx) => {
    await inserirCatalogoMinimo(tx, IDS.empresaA, ' A');
    await inserirCatalogoMinimo(tx, IDS.empresaB, ' B');
    return fn(tx);
  });
}

async function contar(tx: postgres.TransactionSql, tabela: string, empresaId: string) {
  const [r] =
    await tx`select count(*)::int as n from ${tx('public.' + tabela)} where empresa_id = ${empresaId}`;
  return r?.n as number;
}

describe.each(TABELAS_CATALOGO)('RLS em %s', (tabela) => {
  it('dono de A não enxerga as linhas de B, só as próprias', async () => {
    const [deB, deA] = await comCatalogos(async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      return [await contar(tx, tabela, IDS.empresaB), await contar(tx, tabela, IDS.empresaA)];
    });
    expect(deB).toBe(0);
    expect(deA).toBeGreaterThan(0);
  });

  it('dono de A não altera nem exclui linhas de B', async () => {
    const [alteradas, excluidas, restantes] = await comCatalogos(async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      const u =
        await tx`update ${tx('public.' + tabela)} set atualizado_em = now() where empresa_id = ${IDS.empresaB}`;
      const d = await tx`delete from ${tx('public.' + tabela)} where empresa_id = ${IDS.empresaB}`;
      await tx`reset role`;
      return [u.count, d.count, await contar(tx, tabela, IDS.empresaB)];
    });
    expect(alteradas).toBe(0);
    expect(excluidas).toBe(0);
    expect(restantes).toBeGreaterThan(0);
  });

  it('dono de A não move linha própria para a empresa B', async () => {
    await comCatalogos(async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      await esperarErroSql(
        tx`update ${tx('public.' + tabela)} set empresa_id = ${IDS.empresaB} where empresa_id = ${IDS.empresaA}`,
        '42501',
      );
    });
  });

  it('vendedor lê, mas não altera nem exclui', async () => {
    const [lidas, alteradas, excluidas] = await comCatalogos(async (tx) => {
      await assumirUsuario(tx, IDS.vendedorA);
      const n = await contar(tx, tabela, IDS.empresaA);
      const u = await tx`update ${tx('public.' + tabela)} set atualizado_em = now()`;
      const d = await tx`delete from ${tx('public.' + tabela)}`;
      return [n, u.count, d.count];
    });
    expect(lidas).toBeGreaterThan(0);
    expect(alteradas).toBe(0);
    expect(excluidas).toBe(0);
  });

  it('dono altera e exclui as próprias linhas', async () => {
    const [alteradas, excluidas] = await comCatalogos(async (tx) => {
      // Espaço/turno com reserva ou item usado em orçamento não pode ser excluído (FK da agenda e
      // trigger da Etapa 5): limpa agenda e leads do seed nesta transação (desfeita no fim) para
      // testar só a permissão do dono.
      await tx`delete from public.reservas where empresa_id = ${IDS.empresaA}`;
      await tx`delete from public.leads where empresa_id = ${IDS.empresaA}`;
      await assumirUsuario(tx, IDS.donoA);
      const u =
        await tx`update ${tx('public.' + tabela)} set atualizado_em = now() where empresa_id = ${IDS.empresaA}`;
      const d = await tx`delete from ${tx('public.' + tabela)} where empresa_id = ${IDS.empresaA}`;
      return [u.count, d.count];
    });
    expect(alteradas).toBeGreaterThan(0);
    expect(excluidas).toBeGreaterThan(0);
  });

  it('anon não lê', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirAnon(tx);
      await esperarErroSql(tx`select 1 from ${tx('public.' + tabela)} limit 1`, '42501');
    });
  });
});

describe('inserção no catálogo', () => {
  it('dono insere na própria empresa', async () => {
    const r = await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      return tx`insert into public.tipos_evento (empresa_id, nome) values (${IDS.empresaA}, 'Batizado RLS')`;
    });
    expect(r.count).toBe(1);
  });

  it('dono não insere em nome de outra empresa', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      await esperarErroSql(
        tx`insert into public.tipos_evento (empresa_id, nome) values (${IDS.empresaB}, 'Invasão')`,
        '42501',
      );
    });
  });

  it('vendedor não insere', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.vendedorA);
      await esperarErroSql(
        tx`insert into public.opcionais (empresa_id, nome, cobranca, preco_centavos)
           values (${IDS.empresaA}, 'Desconto do vendedor', 'fixo', 0)`,
        '42501',
      );
    });
  });
});

describe('regras_comerciais', () => {
  it('vendedor lê, mas não altera', async () => {
    const [lidas, alteradas] = await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.vendedorA);
      const l = await tx`select sinal_bp from public.regras_comerciais`;
      const u = await tx`update public.regras_comerciais set sinal_bp = 0`;
      return [l.length, u.count];
    });
    expect(lidas).toBe(1);
    expect(alteradas).toBe(0);
  });

  it('dono altera a própria, não a de B, e não insere nem exclui', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      const propria =
        await tx`update public.regras_comerciais set sinal_bp = 2500 where empresa_id = ${IDS.empresaA}`;
      const alheia =
        await tx`update public.regras_comerciais set sinal_bp = 0 where empresa_id = ${IDS.empresaB}`;
      expect(propria.count).toBe(1);
      expect(alheia.count).toBe(0);
    });
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      await esperarErroSql(tx`delete from public.regras_comerciais`, '42501');
    });
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      await esperarErroSql(
        tx`insert into public.regras_comerciais (empresa_id) values (${IDS.empresaA})`,
        '42501',
      );
    });
  });

  it('dono não troca o empresa_id (sem privilégio na coluna)', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      await esperarErroSql(
        tx`update public.regras_comerciais set empresa_id = ${IDS.empresaB}`,
        '42501',
      );
    });
  });

  it('empresa nova nasce com as regras padrão', async () => {
    const regra = await emTransacao(sql, async (tx) => {
      const [e] = await tx`insert into public.empresas (nome, slug, segmento)
        values ('Buffet Novo', 'buffet-novo-regras', 'domicilio') returning id`;
      const [r] = await tx`select * from public.regras_comerciais where empresa_id = ${e!.id}`;
      return r;
    });
    expect(regra).toMatchObject({
      validade_dias: 15,
      prazo_pre_reserva_horas: 48,
      antecedencia_min_dias: 7,
      sinal_bp: 3000,
      parcelas_max: 3,
      prazo_ultima_parcela_dias: 7,
      modo_exibicao_preco: 'exato',
      ajuste_incide: 'pacote',
      deslocamento_modelo: 'nenhum',
    });
  });

  it('backfill cria as regras que faltam e é idempotente', async () => {
    const [criadas, depois, deNovo] = await emTransacao(sql, async (tx) => {
      await tx`delete from public.regras_comerciais where empresa_id = ${IDS.empresaB}`;
      const [a] = await tx`select public.criar_regras_comerciais_faltantes() as n`;
      const [b] =
        await tx`select count(*)::int as n from public.regras_comerciais where empresa_id = ${IDS.empresaB}`;
      const [c] = await tx`select public.criar_regras_comerciais_faltantes() as n`;
      return [a?.n, b?.n, c?.n];
    });
    expect(criadas).toBe(1);
    expect(depois).toBe(1);
    expect(deNovo).toBe(0);
  });

  it('o painel não executa o backfill', async () => {
    await emTransacao(sql, async (tx) => {
      await assumirUsuario(tx, IDS.donoA);
      await esperarErroSql(tx`select public.criar_regras_comerciais_faltantes()`, '42501');
    });
  });
});

describe('integridade entre empresas (FK composta)', () => {
  it('faixa de preço não aponta para pacote de outra empresa', async () => {
    await emTransacao(sql, async (tx) => {
      const { pacote } = await inserirCatalogoMinimo(tx, IDS.empresaB);
      await esperarErroSql(
        tx`insert into public.faixas_preco (empresa_id, pacote_id, ate_convidados, valor_centavos)
           values (${IDS.empresaA}, ${pacote}, 80, 1)`,
        '23503',
      );
    });
  });

  it('seção de cardápio não aponta para pacote de outra empresa', async () => {
    await emTransacao(sql, async (tx) => {
      const { pacote } = await inserirCatalogoMinimo(tx, IDS.empresaB);
      await esperarErroSql(
        tx`insert into public.secoes_cardapio (empresa_id, pacote_id, nome)
           values (${IDS.empresaA}, ${pacote}, 'Invasão')`,
        '23503',
      );
    });
  });

  it('opcional não se vincula a pacote de outra empresa', async () => {
    await emTransacao(sql, async (tx) => {
      const b = await inserirCatalogoMinimo(tx, IDS.empresaB);
      const a = await inserirCatalogoMinimo(tx, IDS.empresaA);
      await esperarErroSql(
        tx`insert into public.opcional_pacotes (empresa_id, opcional_id, pacote_id, relacao)
           values (${IDS.empresaA}, ${a.opcional}, ${b.pacote}, 'compativel')`,
        '23503',
      );
    });
  });

  it('ajuste de dia não aponta para turno de outra empresa', async () => {
    await emTransacao(sql, async (tx) => {
      const { turno } = await inserirCatalogoMinimo(tx, IDS.empresaB);
      await esperarErroSql(
        tx`insert into public.ajustes_dia (empresa_id, tipo, dia_semana, turno_id, ajuste_bp)
           values (${IDS.empresaA}, 'dia_semana', 5, ${turno}, 100)`,
        '23503',
      );
    });
  });
});

describe('restrições do catálogo', () => {
  it('faixas de idade da mesma política não se sobrepõem', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`insert into public.faixas_idade (empresa_id, rotulo, idade_min, idade_max, fator_bp)
               values (${IDS.empresaB}, '0 a 5', 0, 5, 0)`;
      await esperarErroSql(
        tx`insert into public.faixas_idade (empresa_id, rotulo, idade_min, idade_max, fator_bp)
           values (${IDS.empresaB}, '5 a 10', 5, 10, 5000)`,
        '23P01',
      );
    });
  });

  it('faixas do pacote podem repetir as idades da empresa (sobrescrita)', async () => {
    const r = await emTransacao(sql, async (tx) => {
      const { pacote } = await inserirCatalogoMinimo(tx, IDS.empresaB); // já tem 0 a 5 no pacote
      await tx`insert into public.faixas_idade (empresa_id, rotulo, idade_min, idade_max, fator_bp)
               values (${IDS.empresaB}, '0 a 5', 0, 5, 0)`;
      return tx`insert into public.faixas_idade (empresa_id, rotulo, idade_min, idade_max, fator_bp, pacote_id)
                values (${IDS.empresaB}, '6 a 10', 6, 10, 5000, ${pacote})`;
    });
    expect(r.count).toBe(1);
  });

  it('ajuste de dia é único por (tipo, dia, turno), inclusive sem turno', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`insert into public.ajustes_dia (empresa_id, tipo, dia_semana, ajuste_bp)
               values (${IDS.empresaB}, 'dia_semana', 6, 1000)`;
      await esperarErroSql(
        tx`insert into public.ajustes_dia (empresa_id, tipo, dia_semana, ajuste_bp)
           values (${IDS.empresaB}, 'dia_semana', 6, 500)`,
        '23505',
      );
    });
  });

  it.each([
    [
      'ajuste de feriado com dia da semana',
      `insert into public.ajustes_dia (empresa_id, tipo, dia_semana, ajuste_bp) values ($1, 'feriado', 1, 100)`,
    ],
    [
      'ajuste fora do limite',
      `insert into public.ajustes_dia (empresa_id, tipo, dia_semana, ajuste_bp) values ($1, 'dia_semana', 1, -9500)`,
    ],
    [
      'turno sem dia da semana',
      `insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana) values ($1, 'X', '10:00', 60, '{}')`,
    ],
    [
      'turno com dia inválido',
      `insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana) values ($1, 'X', '10:00', 60, '{7}')`,
    ],
    [
      'pacote por pessoa sem preço',
      `insert into public.pacotes (empresa_id, nome, modelo_preco) values ($1, 'X', 'por_pessoa')`,
    ],
    [
      'pacote por faixa sem excedente',
      `insert into public.pacotes (empresa_id, nome, modelo_preco) values ($1, 'X', 'por_faixa')`,
    ],
    [
      'pacote com máximo menor que o mínimo',
      `insert into public.pacotes (empresa_id, nome, modelo_preco, preco_pessoa_centavos, min_convidados, max_convidados) values ($1, 'X', 'por_pessoa', 100, 50, 10)`,
    ],
    [
      'fator de idade acima de 100%',
      `insert into public.faixas_idade (empresa_id, rotulo, idade_min, idade_max, fator_bp) values ($1, 'X', 0, 5, 10001)`,
    ],
    [
      'dinheiro negativo',
      `insert into public.opcionais (empresa_id, nome, cobranca, preco_centavos) values ($1, 'X', 'fixo', -1)`,
    ],
  ])('recusa %s', async (_nome, comando) => {
    await emTransacao(sql, (tx) => esperarErroSql(tx.unsafe(comando, [IDS.empresaB]), '23514'));
  });

  it('tipo de evento com nome repetido (ignorando maiúsculas) é recusado', async () => {
    await emTransacao(sql, async (tx) => {
      await tx`insert into public.tipos_evento (empresa_id, nome) values (${IDS.empresaB}, 'Casamento')`;
      await esperarErroSql(
        tx`insert into public.tipos_evento (empresa_id, nome) values (${IDS.empresaB}, ' casamento ')`,
        '23505',
      );
    });
  });
});
