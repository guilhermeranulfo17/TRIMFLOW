import type postgres from 'postgres';

/** Todas as tabelas de catálogo com RLS por empresa (regras_comerciais é tratada à parte). */
export const TABELAS_CATALOGO = [
  'tipos_evento',
  'espacos',
  'turnos',
  'feriados',
  'ajustes_dia',
  'faixas_deslocamento',
  'pacotes',
  'faixas_preco',
  'secoes_cardapio',
  'faixas_idade',
  'pacote_tipos_evento',
  'opcionais',
  'opcional_pacotes',
  'opcional_tipos_evento',
] as const;

export type TabelaCatalogo = (typeof TABELAS_CATALOGO)[number];

export type IdsCatalogo = {
  tipoEvento: string;
  espaco: string;
  turno: string;
  pacote: string;
  opcional: string;
};

type Sql = postgres.Sql | postgres.TransactionSql;

/**
 * Insere uma linha em cada tabela de catálogo para a empresa (como admin, ignorando RLS).
 * `sufixo` evita colisão de unicidade quando a mesma empresa recebe dois catálogos.
 */
export async function inserirCatalogoMinimo(
  sql: Sql,
  empresaId: string,
  sufixo = '',
): Promise<IdsCatalogo> {
  const [tipo] = await sql`insert into public.tipos_evento (empresa_id, nome)
    values (${empresaId}, ${'Tipo teste' + sufixo}) returning id`;
  const [espaco] = await sql`insert into public.espacos (empresa_id, nome, capacidade_max)
    values (${empresaId}, 'Salão teste', 100) returning id`;
  const [turno] =
    await sql`insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana)
    values (${empresaId}, 'Tarde', '15:00', 240, '{0,1,2,3,4,5,6}') returning id`;
  await sql`insert into public.feriados (empresa_id, data, nome)
    values (${empresaId}, ${sufixo ? '2026-12-26' : '2026-12-25'}, 'Natal')`;
  await sql`insert into public.ajustes_dia (empresa_id, tipo, dia_semana, turno_id, ajuste_bp)
    values (${empresaId}, 'dia_semana', 6, ${turno!.id}, 1000)`;
  await sql`insert into public.faixas_deslocamento (empresa_id, ate_km, valor_centavos)
    values (${empresaId}, ${sufixo ? 11 : 10}, 5000)`;
  const [pacote] =
    await sql`insert into public.pacotes (empresa_id, nome, modelo_preco, valor_excedente_centavos)
    values (${empresaId}, 'Pacote teste', 'por_faixa', 8500) returning id`;
  await sql`insert into public.faixas_preco (empresa_id, pacote_id, ate_convidados, valor_centavos)
    values (${empresaId}, ${pacote!.id}, 50, 450000)`;
  await sql`insert into public.secoes_cardapio (empresa_id, pacote_id, nome, itens)
    values (${empresaId}, ${pacote!.id}, 'Entradas', '{Coxinha}')`;
  await sql`insert into public.faixas_idade (empresa_id, rotulo, idade_min, idade_max, fator_bp, pacote_id)
    values (${empresaId}, '0 a 5 anos', 0, 5, 0, ${pacote!.id})`;
  await sql`insert into public.pacote_tipos_evento (empresa_id, pacote_id, tipo_evento_id)
    values (${empresaId}, ${pacote!.id}, ${tipo!.id})`;
  const [opcional] =
    await sql`insert into public.opcionais (empresa_id, nome, cobranca, preco_centavos)
    values (${empresaId}, 'Mesa temática', 'fixo', 60000) returning id`;
  await sql`insert into public.opcional_pacotes (empresa_id, opcional_id, pacote_id, relacao)
    values (${empresaId}, ${opcional!.id}, ${pacote!.id}, 'compativel')`;
  await sql`insert into public.opcional_tipos_evento (empresa_id, opcional_id, tipo_evento_id)
    values (${empresaId}, ${opcional!.id}, ${tipo!.id})`;

  return {
    tipoEvento: tipo!.id as string,
    espaco: espaco!.id as string,
    turno: turno!.id as string,
    pacote: pacote!.id as string,
    opcional: opcional!.id as string,
  };
}
