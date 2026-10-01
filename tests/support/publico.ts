import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { assumirAnon } from './db';

type Tx = postgres.TransactionSql | postgres.Sql;

/**
 * Apoio aos testes do link público. As funções `publico.*` rodam como anon (igual ao servidor,
 * via comAnon). `comoAnon` assume anon e volta para postgres no fim (RESET ROLE é permitido
 * porque o usuário da sessão é postgres).
 */
export async function comoAnon<T>(tx: postgres.TransactionSql, fn: () => Promise<T>): Promise<T> {
  await assumirAnon(tx);
  try {
    return await fn();
  } finally {
    await tx`reset role`;
  }
}

export type Cenario = {
  empresa: string;
  slug: string;
  tipo: string;
  turno: string;
  espaco: string;
};

/** Tipo de festa, turno (todos os dias, 15h) e espaço novos na empresa. Roda como postgres. */
export async function cenarioPublico(tx: Tx, empresa: string): Promise<Cenario> {
  const sufixo = randomUUID().slice(0, 6);
  const [e] = await tx`select slug from public.empresas where id = ${empresa}`;
  const [tipo] = await tx`insert into public.tipos_evento (empresa_id, nome)
    values (${empresa}, ${'Festa ' + sufixo}) returning id`;
  const [turno] =
    await tx`insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana)
    values (${empresa}, ${'Turno ' + sufixo}, '15:00', 240, '{0,1,2,3,4,5,6}') returning id`;
  const [espaco] = await tx`insert into public.espacos (empresa_id, nome, capacidade_max)
    values (${empresa}, ${'Espaço ' + sufixo}, 200) returning id`;
  return {
    empresa,
    slug: e!.slug as string,
    tipo: tipo!.id as string,
    turno: turno!.id as string,
    espaco: espaco!.id as string,
  };
}

export async function dataDaqui(tx: Tx, dias: number): Promise<string> {
  const [r] = await tx`select (current_date + ${dias}::int)::text as d`;
  return r!.d as string;
}

export type OpcoesIniciar = {
  whatsapp?: string;
  nome?: string;
  data: string;
  ip?: string;
  teste?: boolean;
  origem?: string;
  slug?: string;
};

/** publico.iniciar_orcamento (chame dentro de comoAnon). */
export async function iniciar(tx: Tx, c: Cenario, o: OpcoesIniciar): Promise<string> {
  const [r] = await tx`select publico.iniciar_orcamento(
    ${o.slug ?? c.slug}, ${o.nome ?? 'Maria Cliente'}, ${o.whatsapp ?? '+5534991110000'},
    'v1', 'Li e aceito a política de privacidade.', ${o.origem ?? 'instagram'}::public.origem_lead,
    ${tx.json({ passo: 3 })}, ${c.tipo}, ${o.data}::date, ${c.turno}, ${c.espaco}, 50,
    ${o.ip ?? 'ip-teste'}, ${o.teste ?? false}) as token`;
  return r!.token as string;
}

/** publico.concluir_orcamento com um resultado mínimo (o cálculo real é testado no servidor). */
export async function concluir(
  tx: Tx,
  c: Cenario,
  token: string,
  o: { data: string; total?: number; validade?: string },
): Promise<string> {
  const total = o.total ?? 500_000;
  const resultado = { versaoMotor: 1, ok: true, totalCentavos: total, sinalCentavos: total * 0.3 };
  const itens = [
    {
      tipo: 'pacote',
      descricao: 'Pacote Teste',
      quantidade: 50,
      valorUnitarioCentavos: total / 50,
      subtotalCentavos: total,
      detalhe: '50 × R$ 100,00',
    },
  ];
  const [r] = await tx`select publico.concluir_orcamento(
    ${c.slug}, ${token}, ${tx.json(resultado)}, ${tx.json(itens)}, ${total},
    ${o.validade ?? (await dataDaqui(tx, 15))}::date, ${tx.json({ passo: 6 })},
    ${c.tipo}, ${o.data}::date, ${c.turno}, ${c.espaco}, 50) as token`;
  return r!.token as string;
}

export async function preReservar(tx: Tx, c: Cenario, token: string, ip = 'ip-teste') {
  const [r] = await tx`select publico.pre_reservar(${c.slug}, ${token}, ${ip}) as r`;
  return r!.r as {
    ok: boolean;
    codigo?: string;
    simulada?: boolean;
    expira_em?: string;
    sinal_centavos?: number;
    sugestoes?: { data: string; turno_id: string }[];
  };
}

export type OpcoesInterno = {
  orcamentoId?: string | null;
  whatsapp?: string;
  nome?: string;
  data: string;
  turno?: string;
  convidados?: number;
  subtotal?: number;
  desconto?: number;
  observacoes?: string;
  observacoesInternas?: string;
  descontoMotivo?: string;
  foraAntecedencia?: boolean;
  validade?: string;
};

/** public.salvar_orcamento_interno (chame com a identidade do usuário já assumida). */
export async function salvarInterno(tx: Tx, c: Cenario, o: OpcoesInterno) {
  const subtotal = o.subtotal ?? 500_000;
  const desconto = o.desconto ?? 0;
  const total = subtotal - desconto;
  const resultado = {
    versaoMotor: 1,
    ok: true,
    linhas: [],
    subtotalCentavos: subtotal,
    descontoCentavos: desconto,
    totalCentavos: total,
    sinalCentavos: Math.round(total * 0.3),
  };
  const itens = [
    {
      tipo: 'pacote',
      descricao: 'Pacote Interno',
      quantidade: 1,
      valorUnitarioCentavos: subtotal,
      subtotalCentavos: subtotal,
      detalhe: 'Valor fixo',
    },
    ...(desconto
      ? [
          {
            tipo: 'desconto',
            descricao: 'Desconto',
            quantidade: 1,
            valorUnitarioCentavos: -desconto,
            subtotalCentavos: -desconto,
            detalhe: '',
          },
        ]
      : []),
  ];
  const validade = o.validade ?? (await dataDaqui(tx, 15));
  const [r] = await tx`select * from public.salvar_orcamento_interno(
    ${o.orcamentoId ?? null}::uuid, ${o.whatsapp ?? '+5534990055001'}, ${o.nome ?? 'Cliente Interno'},
    'instagram'::public.origem_lead, ${tx.json(resultado)}, ${tx.json(itens)}, ${total},
    ${validade}::date, ${tx.json({ interno: true })}, ${c.tipo}, ${o.data}::date,
    ${o.turno ?? c.turno}, ${c.espaco}, ${o.convidados ?? 50}, null,
    ${tx.json({ cardapio: [] })}, ${o.observacoes ?? null}, ${o.observacoesInternas ?? null},
    ${o.descontoMotivo ?? null}, ${o.foraAntecedencia ?? false})`;
  return r as { id: string; token: string; numero: number; versao: number; lead_id: string };
}
