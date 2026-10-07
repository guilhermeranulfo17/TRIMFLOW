import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conectar, IDS, urlBancoTeste } from '../support/db';

/*
 * Etapa 12 pelo servidor: a aba Clientes junta as festas confirmadas pelo lead e, na reserva
 * feita direto na Agenda, pelo lead do mesmo WhatsApp. Lead de teste, pré-reserva e reserva
 * cancelada ficam de fora; o vendedor não recebe contrato nem financeiro; outro buffet não abre.
 */

process.env.DATABASE_URL ??= urlBancoTeste();
const sql = conectar();
const criadas: string[] = [];
const leadsCriados: string[] = [];
let leadReal: { id: string; zap: string };
let semLead: string;

const ZAP_AVULSO = '+5534990001201';
const ZAP_TESTE = '+5534990001202';

async function reserva(p: {
  data: string;
  nome: string;
  zap: string | null;
  lead?: string | null;
  tipo?: 'confirmada' | 'pre_reserva';
  status?: 'ativa' | 'realizada' | 'cancelada';
  valor?: number;
}): Promise<string> {
  const [base] = await sql`select e.id as espaco, t.id as turno from public.espacos e
    cross join public.turnos t
    where e.empresa_id = ${IDS.empresaA} and t.empresa_id = ${IDS.empresaA} limit 1`;
  const tipo = p.tipo ?? 'confirmada';
  const [r] = await sql`insert into public.reservas (empresa_id, espaco_id, turno_id, data, inicio,
      fim, tipo, status, expira_em, cliente_nome, cliente_whatsapp_e164, lead_id,
      valor_total_centavos)
    values (${IDS.empresaA}, ${base!.espaco}, ${base!.turno}, ${p.data},
      ${p.data}::date + time '14:00', ${p.data}::date + time '18:00', ${tipo},
      ${p.status ?? 'realizada'}, ${tipo === 'pre_reserva' ? sql`now() + interval '1 day'` : null},
      ${p.nome}, ${p.zap}, ${p.lead ?? null}, ${p.valor ?? 400000})
    returning id`;
  criadas.push(r!.id);
  return r!.id as string;
}

async function usuario(id: string) {
  const { lerUsuario } = await import('@/server/auth/sessao');
  return { ...(await lerUsuario(id))!, suporte: null };
}

beforeAll(async () => {
  process.env.DATABASE_URL = urlBancoTeste();
  const [l] = await sql`select id, whatsapp_e164 from public.leads
    where empresa_id = ${IDS.empresaA} and not eh_teste and anonimizado_em is null
      and whatsapp_e164 is not null
    order by criado_em limit 1`;
  leadReal = { id: l!.id, zap: l!.whatsapp_e164 };
  const [t] = await sql`insert into public.leads (empresa_id, nome, whatsapp_e164, eh_teste)
    values (${IDS.empresaA}, 'Lead de teste Clientes', ${ZAP_TESTE}, true) returning id`;
  leadsCriados.push(t!.id);

  // festa feita na Agenda, sem lead, com o WhatsApp do lead real: entra no mesmo cliente
  await reserva({ data: '2001-03-10', nome: 'Digitado na Agenda', zap: leadReal.zap });
  // sem lead e com um WhatsApp desconhecido: cliente próprio, duas festas
  semLead = await reserva({ data: '2001-04-10', nome: 'Avulsa Clientes', zap: ZAP_AVULSO });
  await reserva({ data: '2002-04-10', nome: 'Avulsa Clientes', zap: ZAP_AVULSO, valor: 600000 });
  // fora: lead de teste, pré-reserva e cancelada
  await reserva({ data: '2001-05-10', nome: 'Teste', zap: ZAP_TESTE, lead: t!.id });
  await reserva({
    data: '2099-05-10',
    nome: 'Pré Clientes',
    zap: '+5534990001203',
    tipo: 'pre_reserva',
    status: 'ativa',
  });
  await reserva({
    data: '2001-06-10',
    nome: 'Cancelada Clientes',
    zap: '+5534990001204',
    status: 'cancelada',
  });
});

afterAll(async () => {
  await sql`delete from public.reservas where id in ${sql(criadas)}`;
  await sql`delete from public.leads where id in ${sql(leadsCriados)}`;
  await sql.end();
});

describe('aba Clientes', () => {
  it('junta pelo lead e pelo WhatsApp; deixa de fora teste, pré-reserva e cancelada', async () => {
    const { carregarClientes } = await import('@/server/clientes/carregar');
    const { clientes } = await carregarClientes(await usuario(IDS.donoA));
    const doLead = clientes.find((c) => c.leadId === leadReal.id)!;
    expect(doLead.festas.some((f) => f.data === '2001-03-10')).toBe(true);
    // o nome é o do lead, não o digitado na Agenda
    expect(doLead.nome).not.toBe('Digitado na Agenda');
    expect(clientes.some((c) => c.nome === 'Digitado na Agenda')).toBe(false);

    const avulso = clientes.find((c) => c.whatsapp === ZAP_AVULSO)!;
    expect(avulso.leadId).toBeNull();
    expect(avulso.festas).toHaveLength(2);
    expect(avulso.totalCentavos).toBe(1000000);

    const nomes = clientes.map((c) => c.nome);
    expect(nomes).not.toContain('Lead de teste Clientes');
    expect(nomes).not.toContain('Teste');
    expect(nomes).not.toContain('Pré Clientes');
    expect(nomes).not.toContain('Cancelada Clientes');
  });

  it('ficha pelo lead ou por uma reserva; dono vê financeiro, vendedor não', async () => {
    const { carregarFichaCliente } = await import('@/server/clientes/carregar');
    const dono = await usuario(IDS.donoA);
    const porReserva = await carregarFichaCliente(dono, semLead);
    expect(porReserva!.cliente.festas).toHaveLength(2);
    expect(porReserva!.festas.every((f) => f.financeiro !== null)).toBe(true);
    expect(porReserva!.lead).toBeNull();

    const porLead = await carregarFichaCliente(dono, leadReal.id);
    expect(porLead!.cliente.leadId).toBe(leadReal.id);
    expect(porLead!.lead).not.toBeNull();

    const vend = await carregarFichaCliente(await usuario(IDS.vendedorA), semLead);
    expect(vend!.festas.every((f) => f.financeiro === null && f.contrato === null)).toBe(true);
  });

  it('outro buffet não abre a ficha nem vê os clientes', async () => {
    const { carregarClientes, carregarFichaCliente } = await import('@/server/clientes/carregar');
    const b = await usuario(IDS.donoB);
    expect(await carregarFichaCliente(b, semLead)).toBeNull();
    expect(await carregarFichaCliente(b, leadReal.id)).toBeNull();
    const { clientes } = await carregarClientes(b);
    expect(clientes.some((c) => c.whatsapp === ZAP_AVULSO)).toBe(false);
  });

  it('id inválido não vai ao banco', async () => {
    const { carregarFichaCliente } = await import('@/server/clientes/carregar');
    expect(await carregarFichaCliente(await usuario(IDS.donoA), 'x')).toBeNull();
  });
});
