import { describe, expect, it } from 'vitest';
import {
  agruparClientes,
  buscaClientesDaUrl,
  casaBusca,
  filtroClientesDaUrl,
  limiteDaUrl,
  LIMITE_CLIENTES,
  mensagemFestaDeNovo,
  montarCliente,
  ordenarClientes,
  proximoAniversario,
  telaClientes,
  type FestaDoCliente,
} from '@/domain/clientes';

const HOJE = '2026-10-15';
let seq = 0;
const festa = (p: Partial<FestaDoCliente> = {}): FestaDoCliente => ({
  reservaId: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  leadId: null,
  nome: 'Ana Souza',
  whatsapp: '+5534991110000',
  data: '2025-11-01',
  status: 'realizada',
  valorTotalCentavos: 500000,
  tipoEvento: 'Infantil',
  statusLead: null,
  ...p,
});

describe('proximoAniversario', () => {
  it('um ano depois quando ainda está na janela', () => {
    expect(proximoAniversario('2025-11-01', HOJE)).toBe('2026-11-01');
    // 30 dias depois do aniversário ainda conta
    expect(proximoAniversario('2025-09-15', HOJE)).toBe('2026-09-15');
  });
  it('passou da janela: o do ano seguinte', () => {
    expect(proximoAniversario('2025-09-14', HOJE)).toBe('2027-09-14');
  });
  it('festa de vários anos atrás: o aniversário deste ciclo', () => {
    expect(proximoAniversario('2022-12-01', HOJE)).toBe('2026-12-01');
  });
  it('29 de fevereiro vira 28 nos anos comuns', () => {
    expect(proximoAniversario('2024-02-29', '2025-02-10')).toBe('2025-02-28');
  });
});

describe('agruparClientes', () => {
  it('junta pelo lead, depois pelo WhatsApp; sem os dois, a reserva fica sozinha', () => {
    const lead = '11111111-1111-4111-8111-111111111111';
    const cs = agruparClientes(
      [
        festa({ leadId: lead, data: '2024-10-20' }),
        festa({ leadId: lead, data: '2025-10-20' }),
        festa({ whatsapp: '+5534992220000', nome: 'Bia', data: '2025-03-01' }),
        festa({ whatsapp: '+5534992220000', nome: 'Beatriz Lima', data: '2026-03-01' }),
        festa({ whatsapp: null, nome: 'Sem telefone' }),
        festa({ whatsapp: null, nome: 'Outro sem telefone' }),
      ],
      HOJE,
    );
    expect(cs).toHaveLength(4);
    const doLead = cs.find((c) => c.leadId === lead)!;
    expect(doLead.id).toBe(lead);
    expect(doLead.festas.map((f) => f.data)).toEqual(['2025-10-20', '2024-10-20']);
    const doZap = cs.find((c) => c.whatsapp === '+5534992220000')!;
    // sem lead: id = reserva mais recente, nome dela
    expect(doZap.leadId).toBeNull();
    expect(doZap.nome).toBe('Beatriz Lima');
    expect(doZap.id).toBe(doZap.festas[0]!.reservaId);
  });

  it('última, próxima, primeira festa e total', () => {
    const c = montarCliente(
      [
        festa({ data: '2024-05-01', valorTotalCentavos: 300000 }),
        festa({ data: '2025-05-01', valorTotalCentavos: null }),
        festa({ data: '2027-05-01', status: 'ativa', valorTotalCentavos: 700000 }),
        festa({ data: '2026-12-01', status: 'ativa', valorTotalCentavos: 100000 }),
      ],
      HOJE,
    );
    expect(c.primeiraFesta).toBe('2024-05-01');
    expect(c.ultimaFesta).toBe('2025-05-01');
    expect(c.proximaFesta).toBe('2026-12-01');
    expect(c.totalCentavos).toBe(1100000);
    // tem festa marcada: não é hora de chamar
    expect(c.aniversario).toBeNull();
    expect(c.horaDeChamar).toBe(false);
  });

  it('festa de hoje conta como marcada, não como passada', () => {
    const c = montarCliente([festa({ data: HOJE, status: 'ativa' })], HOJE);
    expect(c.proximaFesta).toBe(HOJE);
    expect(c.ultimaFesta).toBeNull();
  });

  it('hora de chamar: aniversário em até 60 dias (ou até 30 dias atrás)', () => {
    expect(montarCliente([festa({ data: '2025-12-14' })], HOJE).horaDeChamar).toBe(true);
    expect(montarCliente([festa({ data: '2025-12-15' })], HOJE).horaDeChamar).toBe(false);
    expect(montarCliente([festa({ data: '2025-09-15' })], HOJE).horaDeChamar).toBe(true);
    expect(montarCliente([festa({ data: '2025-12-15' })], HOJE).aniversario).toBe('2026-12-15');
  });

  it('lead que já pediu orçamento de novo está em negociação (não entra no "chamar")', () => {
    const lead = '22222222-2222-4222-8222-222222222222';
    const c = montarCliente(
      [festa({ leadId: lead, data: '2025-11-01', statusLead: 'em_andamento' })],
      HOJE,
    );
    expect(c.emNegociacao).toBe(true);
    expect(c.horaDeChamar).toBe(false);
    const r = montarCliente(
      [festa({ leadId: lead, data: '2025-11-01', statusLead: 'realizado' })],
      HOJE,
    );
    expect(r.horaDeChamar).toBe(true);
  });

  it('prefere o nome e o WhatsApp do lead', () => {
    const lead = '33333333-3333-4333-8333-333333333333';
    const c = montarCliente(
      [
        festa({ nome: 'Digitado na agenda', whatsapp: null, data: '2026-01-01' }),
        festa({ leadId: lead, nome: 'Carla Dias', whatsapp: '+5534993330000', data: '2025-01-01' }),
      ],
      HOJE,
    );
    expect(c.nome).toBe('Carla Dias');
    expect(c.whatsapp).toBe('+5534993330000');
    expect(c.id).toBe(lead);
  });
});

describe('busca, filtros e ordem', () => {
  const cs = agruparClientes(
    [
      festa({ nome: 'José Antônio', whatsapp: '+5534991234567', data: '2025-11-20' }),
      festa({
        nome: 'Maria Clara',
        whatsapp: '+5534997654321',
        data: '2026-12-10',
        status: 'ativa',
      }),
      festa({ nome: 'Paula', whatsapp: '+5534990000001', data: '2025-02-01' }),
      festa({ nome: 'Aline', whatsapp: '+5534990000002', data: '2025-10-30' }),
    ],
    HOJE,
  );

  it('busca sem acento e por dígitos do telefone', () => {
    const jose = cs.find((c) => c.nome === 'José Antônio')!;
    expect(casaBusca(jose, 'jose antonio')).toBe(true);
    expect(casaBusca(jose, '1234')).toBe(true);
    expect(casaBusca(jose, '(34) 99123-4567')).toBe(true);
    expect(casaBusca(jose, '123')).toBe(false);
    expect(casaBusca(jose, 'maria')).toBe(false);
    expect(casaBusca(jose, '   ')).toBe(true);
  });

  it('filtros da URL e limite', () => {
    expect(filtroClientesDaUrl('chamar')).toBe('chamar');
    expect(filtroClientesDaUrl(['marcadas'])).toBe('marcadas');
    expect(filtroClientesDaUrl('x')).toBe('todos');
    expect(filtroClientesDaUrl(undefined)).toBe('todos');
    expect(buscaClientesDaUrl(` ${'a'.repeat(100)} `)).toHaveLength(80);
    expect(limiteDaUrl('100')).toBe(100);
    expect(limiteDaUrl('10')).toBe(LIMITE_CLIENTES);
    expect(limiteDaUrl('abc')).toBe(LIMITE_CLIENTES);
    expect(limiteDaUrl('99999')).toBe(2000);
  });

  it('ordem: chamar pelo aniversário, marcadas pela próxima, todos pela mais recente', () => {
    const chamar = ordenarClientes(
      cs.filter((c) => c.horaDeChamar),
      'chamar',
    ).map((c) => c.nome);
    expect(chamar).toEqual(['Aline', 'José Antônio']);
    expect(ordenarClientes(cs, 'todos').map((c) => c.nome)).toEqual([
      'Maria Clara',
      'José Antônio',
      'Aline',
      'Paula',
    ]);
  });

  it('tela: contagem com a busca, filtro e "mostrar mais"', () => {
    const t = telaClientes(cs, 'chamar', '');
    expect(t.total).toBe(4);
    expect(t.contagem).toEqual({ chamar: 2, marcadas: 1, todos: 4 });
    expect(t.clientes.map((c) => c.nome)).toEqual(['Aline', 'José Antônio']);
    expect(t.temMais).toBe(false);
    const b = telaClientes(cs, 'todos', 'maria');
    expect(b.contagem).toEqual({ chamar: 0, marcadas: 1, todos: 1 });
    const muitos = agruparClientes(
      Array.from({ length: LIMITE_CLIENTES + 1 }, (_, i) =>
        festa({ whatsapp: `+55349900${String(i).padStart(5, '0')}` }),
      ),
      HOJE,
    );
    const m = telaClientes(muitos, 'todos', '');
    expect(m.clientes).toHaveLength(LIMITE_CLIENTES);
    expect(m.temMais).toBe(true);
  });
});

describe('mensagemFestaDeNovo', () => {
  it('lembra a festa e oferece a próxima', () => {
    expect(
      mensagemFestaDeNovo({
        nome: 'Ana Souza',
        buffet: 'Buffet Demo',
        vendedor: 'Rafa Lima',
        tipoFesta: 'Infantil',
        ultimaFesta: '2025-11-01',
        hoje: HOJE,
      }),
    ).toBe(
      'Oi, Ana! Aqui é Rafa, do Buffet Demo. Já faz quase um ano da festa (infantil) aqui com a gente, no dia 1 de novembro de 2025. Já está pensando na próxima? Posso te mandar as datas livres e uma proposta atualizada.',
    );
  });
  it('tempo e falta de dados', () => {
    const m = (ultimaFesta: string | null) =>
      mensagemFestaDeNovo({ nome: 'Bia', buffet: 'B', ultimaFesta, hoje: HOJE });
    expect(m('2026-06-01')).toContain('Já faz alguns meses da festa aqui');
    expect(m('2025-10-01')).toContain('Já faz um ano');
    expect(m('2024-10-01')).toContain('Já faz mais de um ano');
    expect(m(null)).toBe(
      'Oi, Bia! Aqui é do B. Já está pensando na próxima? Posso te mandar as datas livres e uma proposta atualizada.',
    );
  });
});
