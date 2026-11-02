import type postgres from 'postgres';

/**
 * Reserva confirmada de teste (cria espaço e turno se a empresa não tiver), daqui a `dias`
 * dias. Escrita direta como superusuário: só para preparar cenários de teste.
 */
export async function criarReservaConfirmada(
  sql: postgres.Sql,
  empresaId: string,
  o: { dias: number; convidados?: number; valorCentavos?: number; orcamentoId?: string | null },
): Promise<string> {
  let [esp] =
    await sql`select id from public.espacos where empresa_id = ${empresaId} order by ordem limit 1`;
  if (!esp) {
    [esp] = await sql`insert into public.espacos (empresa_id, nome, capacidade_max)
      values (${empresaId}, 'Salão', 200) returning id`;
  }
  let [tur] =
    await sql`select id from public.turnos where empresa_id = ${empresaId} order by ordem limit 1`;
  if (!tur) {
    [tur] =
      await sql`insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana)
      values (${empresaId}, 'Tarde', '15:00', 240, '{0,1,2,3,4,5,6}') returning id`;
  }
  // horário único por reserva (o banco não deixa duas no mesmo slot)
  const [r] =
    await sql`insert into public.reservas (empresa_id, espaco_id, turno_id, data, inicio, fim,
      tipo, cliente_nome, convidados, valor_total_centavos, orcamento_id)
    values (${empresaId}, ${esp!.id}, ${tur!.id}, current_date + ${o.dias}::int,
      (current_date + ${o.dias}::int)::timestamptz + interval '15 hours',
      (current_date + ${o.dias}::int)::timestamptz + interval '19 hours',
      'confirmada', 'Família Teste', ${o.convidados ?? 50}, ${o.valorCentavos ?? 500000},
      ${o.orcamentoId ?? null})
    returning id`;
  return r!.id as string;
}
