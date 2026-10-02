import { describe, expect, it } from 'vitest';
import {
  atendimento,
  calcularOcupacao,
  calcularResumo,
  datasLivres,
  diasDoPeriodo,
  filtrarPorVendedor,
  formatarMinutos,
  mediana,
  montarFunil,
  motivosDePerda,
  periodoAnterior,
  porOrigem,
  razaoBp,
  resolverPeriodo,
  textoPromocao,
  turnoNaFrase,
  variacaoBp,
  type ConfigOcupacao,
  type FatosNumeros,
  type LeadFato,
} from '@/domain/numeros';

const SP = 'America/Sao_Paulo';
const P = { de: '2026-10-01', ate: '2026-10-31' };

let n = 0;
function lead(o: Partial<LeadFato> = {}): LeadFato {
  n += 1;
  return {
    id: `l${n}`,
    criadoEm: new Date('2026-10-10T15:00:00Z'),
    origem: 'instagram',
    responsavelId: null,
    status: 'novo',
    temperatura: 'frio',
    orcamentoCompleto: false,
    pediuPreOuVisita: false,
    temReservaConfirmada: false,
    propostaStatus: null,
    totalVigenteCentavos: null,
    perdidoEm: null,
    motivoPerda: null,
    acaoClienteEm: null,
    contatoAposAcaoEm: null,
    avisoEm: null,
    contatoAposAvisoEm: null,
    ...o,
  };
}
const vazio: FatosNumeros = { leads: [], reservas: [], funil: [] };

describe('período', () => {
  it('atalhos no fuso da empresa e período anterior de mesmo tamanho', () => {
    expect(resolverPeriodo({ periodo: '7d' }, '2026-10-02')).toMatchObject({
      de: '2026-09-26',
      ate: '2026-10-02',
    });
    expect(resolverPeriodo({}, '2026-10-02')).toMatchObject({ chave: '30d', de: '2026-09-03' });
    expect(resolverPeriodo({ periodo: 'mes' }, '2026-10-02')).toMatchObject({
      de: '2026-10-01',
      ate: '2026-10-02',
    });
    expect(resolverPeriodo({ periodo: 'mes_passado' }, '2026-03-15')).toMatchObject({
      de: '2026-02-01',
      ate: '2026-02-28',
    });
    expect(periodoAnterior({ de: '2026-10-01', ate: '2026-10-31' })).toEqual({
      de: '2026-08-31',
      ate: '2026-09-30',
    });
    expect(diasDoPeriodo({ de: '2026-02-01', ate: '2026-02-28' })).toBe(28);
  });

  it('de/até: fim no futuro vira hoje; invertido ou longo demais cai no padrão', () => {
    expect(resolverPeriodo({ de: '2026-09-01', ate: '2026-12-31' }, '2026-10-02')).toMatchObject({
      chave: 'personalizado',
      de: '2026-09-01',
      ate: '2026-10-02',
    });
    expect(resolverPeriodo({ de: '2026-10-05', ate: '2026-10-01' }, '2026-10-10').chave).toBe(
      '30d',
    );
    expect(resolverPeriodo({ de: '2024-01-01', ate: '2026-10-01' }, '2026-10-10').chave).toBe(
      '30d',
    );
  });
});

describe('razões e mediana', () => {
  it('divisão por zero vira null', () => {
    expect(razaoBp(1, 0)).toBeNull();
    expect(razaoBp(2, 13)).toBe(1538); // 15,38%
    expect(variacaoBp(5, 0)).toBeNull();
    expect(variacaoBp(15, 10)).toBe(5000);
    expect(variacaoBp(5, 10)).toBe(-5000);
  });
  it('mediana', () => {
    expect(mediana([])).toBeNull();
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([1, 2])).toBe(2); // 1,5 → 2
    expect(formatarMinutos(125)).toBe('2 h 5 min');
    expect(formatarMinutos(1500)).toBe('1 dia 1 h');
  });
});

describe('resumo', () => {
  it('período sem dados: tudo zero, conversão nula', () => {
    expect(calcularResumo(vazio, P, SP)).toMatchObject({
      leads: 0,
      reservas: 0,
      conversaoBp: null,
      emAbertoCentavos: 0,
    });
  });

  it('troca de mês no fuso de São Paulo: 01/11 00:30 UTC ainda é 31/10', () => {
    const f = { ...vazio, leads: [lead({ criadoEm: new Date('2026-11-01T00:30:00Z') })] };
    expect(calcularResumo(f, P, SP).leads).toBe(1);
    expect(calcularResumo(f, { de: '2026-11-01', ate: '2026-11-30' }, SP).leads).toBe(0);
  });

  it('reserva conta pela data da confirmação; lead perdido, reaberto e reservado conta', () => {
    const l = lead({
      status: 'reservado',
      criadoEm: new Date('2026-09-20T12:00:00Z'),
      perdidoEm: null,
    });
    const f: FatosNumeros = {
      leads: [l],
      reservas: [
        { leadId: l.id, confirmadaEm: new Date('2026-10-05T12:00:00Z'), valorCentavos: 703237 },
        { leadId: l.id, confirmadaEm: new Date('2026-10-06T12:00:00Z'), valorCentavos: 100 },
      ],
      funil: [],
    };
    const r = calcularResumo(f, P, SP);
    expect(r.reservas).toBe(1); // lead único
    expect(r.valorReservadoCentavos).toBe(703337);
    expect(r.leads).toBe(0); // criado em setembro
  });

  it('conversão = reservados ÷ decididos (em aberto não distorce)', () => {
    const f: FatosNumeros = {
      ...vazio,
      leads: [
        lead({ status: 'reservado' }),
        lead({ status: 'perdido' }),
        lead({ status: 'em_andamento', propostaStatus: 'expirado' }),
        lead({ status: 'em_andamento', propostaStatus: 'enviado' }),
        lead({ status: 'novo' }),
      ],
    };
    expect(calcularResumo(f, P, SP)).toMatchObject({
      decididos: 3,
      reservadosDecididos: 1,
      conversaoBp: 3333,
    });
  });

  it('em aberto: em andamento, pré-reservado e quentes ainda abertos', () => {
    const f: FatosNumeros = {
      ...vazio,
      leads: [
        lead({ status: 'em_andamento', totalVigenteCentavos: 1000 }),
        lead({ status: 'pre_reservado', totalVigenteCentavos: 2000 }),
        lead({ status: 'novo', temperatura: 'quente', totalVigenteCentavos: 4000 }),
        lead({ status: 'perdido', temperatura: 'quente', totalVigenteCentavos: 8000 }),
        lead({ status: 'novo', totalVigenteCentavos: 16000 }),
      ],
    };
    expect(calcularResumo(f, P, SP).emAbertoCentavos).toBe(7000);
  });

  it('funil: sessões e coorte do link (interno fica fora)', () => {
    const t = new Date('2026-10-10T15:00:00Z');
    const f: FatosNumeros = {
      leads: [
        lead({ orcamentoCompleto: true, pediuPreOuVisita: true, temReservaConfirmada: true }),
        lead({ orcamentoCompleto: true }),
        lead({ origem: 'interno', orcamentoCompleto: true }),
      ],
      reservas: [],
      funil: [
        ...['a', 'b', 'c', 'd'].map((s) => ({
          sessao: s,
          evento: 'pagina_vista' as const,
          passo: 0,
          origem: 'instagram' as const,
          criadoEm: t,
        })),
        { sessao: 'a', evento: 'passo_concluido', passo: 1, origem: 'instagram', criadoEm: t },
        { sessao: 'b', evento: 'passo_visto', passo: 2, origem: 'instagram', criadoEm: t },
        { sessao: 'b', evento: 'passo_visto', passo: 3, origem: 'instagram', criadoEm: t },
        { sessao: 'c', evento: 'passo_visto', passo: 1, origem: 'instagram', criadoEm: t },
      ],
    };
    const r = calcularResumo(f, P, SP);
    expect(r).toMatchObject({
      visitas: 4,
      inicios: 2,
      leads: 3,
      funilLeads: 2,
      funilCompletos: 2,
      funilPreVisitas: 1,
      funilReservas: 1,
    });
    const { etapas, maiorQueda } = montarFunil(r);
    expect(etapas.map((e) => e.taxaBp)).toEqual([null, 5000, 10000, 10000, 5000, 10000]);
    expect(maiorQueda).toBe(
      'A maior perda está entre a visita e o orçamento: 50% saem sem começar.',
    );
  });

  it('funil sem visitas não inventa queda', () => {
    expect(montarFunil(calcularResumo(vazio, P, SP)).maiorQueda).toBeNull();
  });
});

describe('por origem, perdas, vendedor e atendimento', () => {
  it('por origem ordenado por valor reservado', () => {
    const a = lead({ origem: 'google', status: 'reservado' });
    const b = lead({ origem: 'instagram', status: 'perdido' });
    const c = lead({ origem: 'qrcode' });
    const f: FatosNumeros = {
      leads: [a, b, c],
      reservas: [
        { leadId: a.id, confirmadaEm: new Date('2026-10-12T12:00:00Z'), valorCentavos: 5000 },
      ],
      funil: [],
    };
    const linhas = porOrigem(f, P, SP);
    expect(linhas.map((l) => l.origem)).toEqual(['google', 'instagram', 'qrcode']);
    expect(linhas[0]).toMatchObject({
      leads: 1,
      reservas: 1,
      conversaoBp: 10000,
      valorReservadoCentavos: 5000,
    });
    expect(linhas[1]).toMatchObject({ conversaoBp: 0 });
    expect(linhas[2]).toMatchObject({ conversaoBp: null });
  });

  it('motivos de perda pela data da perda', () => {
    const f: FatosNumeros = {
      ...vazio,
      leads: [
        lead({
          status: 'perdido',
          perdidoEm: new Date('2026-10-03T12:00:00Z'),
          motivoPerda: 'preco',
        }),
        lead({
          status: 'perdido',
          perdidoEm: new Date('2026-10-04T12:00:00Z'),
          motivoPerda: 'preco',
        }),
        lead({
          status: 'perdido',
          perdidoEm: new Date('2026-10-05T12:00:00Z'),
          motivoPerda: 'data_indisponivel',
        }),
        lead({
          status: 'perdido',
          perdidoEm: new Date('2026-09-05T12:00:00Z'),
          motivoPerda: 'preco',
        }),
        lead({ status: 'em_andamento', perdidoEm: null }), // reaberto: não conta
      ],
    };
    expect(motivosDePerda(f, P, SP)).toEqual([
      { motivo: 'preco', quantidade: 2, bp: 6667 },
      { motivo: 'data_indisponivel', quantidade: 1, bp: 3333 },
    ]);
  });

  it('vendedor vê só os leads e reservas dele (sem funil)', () => {
    const meu = lead({ responsavelId: 'v1', status: 'reservado' });
    const outro = lead({ responsavelId: 'v2' });
    const f: FatosNumeros = {
      leads: [meu, outro],
      reservas: [
        { leadId: outro.id, confirmadaEm: new Date('2026-10-12T12:00:00Z'), valorCentavos: 1 },
      ],
      funil: [
        {
          sessao: 's',
          evento: 'pagina_vista',
          passo: 0,
          origem: 'google',
          criadoEm: new Date('2026-10-12T12:00:00Z'),
        },
      ],
    };
    const r = calcularResumo(filtrarPorVendedor(f, 'v1'), P, SP);
    expect(r).toMatchObject({ leads: 1, reservas: 0, visitas: 0 });
  });

  it('tempo até a primeira ação: mediana por vendedor, sem contato fica de fora', () => {
    const acao = new Date('2026-10-10T12:00:00Z');
    const depois = (min: number) => new Date(acao.getTime() + min * 60_000);
    const f: FatosNumeros = {
      ...vazio,
      leads: [
        lead({
          responsavelId: 'v1',
          acaoClienteEm: acao,
          contatoAposAcaoEm: depois(10),
          avisoEm: depois(2),
          contatoAposAvisoEm: depois(10),
        }),
        lead({ responsavelId: 'v1', acaoClienteEm: acao, contatoAposAcaoEm: depois(30) }),
        lead({ responsavelId: 'v2', acaoClienteEm: acao }),
        lead({
          responsavelId: 'v2',
          acaoClienteEm: new Date('2026-09-01T12:00:00Z'),
          contatoAposAcaoEm: depois(1),
        }),
      ],
    };
    const r = atendimento(f, P, SP);
    expect(r.total).toMatchObject({ acoes: 3, semContato: 1, medianaMin: 20, medianaAvisoMin: 8 });
    expect(r.porVendedor).toEqual([
      { responsavelId: 'v1', acoes: 2, semContato: 0, medianaMin: 20, medianaAvisoMin: 8 },
      { responsavelId: 'v2', acoes: 1, semContato: 1, medianaMin: null, medianaAvisoMin: null },
    ]);
  });
});

describe('ocupação e datas livres', () => {
  const cfg: ConfigOcupacao = {
    espacos: [{ id: 'e1', capacidade: 1 }],
    turnos: [
      { id: 'tarde', nome: 'Tarde', diasSemana: [0, 6], ordem: 1 },
      { id: 'noite', nome: 'Noite', diasSemana: [5, 6], ordem: 2 },
    ],
    bloqueios: [{ data: '2026-10-11', turnoId: null, espacoId: null }],
    reservas: [
      { data: '2026-10-03', turnoId: 'tarde', espacoId: 'e1' },
      { data: '2026-10-03', turnoId: 'noite', espacoId: 'e1' },
      { data: '2026-10-10', turnoId: 'tarde', espacoId: 'e1' },
      { data: '2026-10-10', turnoId: 'tarde', espacoId: 'e1' }, // duplicada: limitada à capacidade
    ],
  };

  it('ocupação por mês e por dia × turno; bloqueio sai da conta', () => {
    const o = calcularOcupacao(cfg, '2026-10-01', 1);
    expect(o.ate).toBe('2026-10-31');
    // outubro/2026: sábados 3,10,17,24,31 (tarde+noite), domingos 4,11,18,25 (tarde), sextas 2,9,16,23,30 (noite)
    // domingo 11 bloqueado → 5×2 + 3 + 5 = 18 slots; reservados 3
    expect(o.total).toEqual({ disponiveis: 18, reservados: 3, bp: 1667 });
    expect(o.porMes).toEqual([{ mes: '2026-10', disponiveis: 18, reservados: 3, bp: 1667 }]);
    expect(o.porDiaTurno.find((x) => x.dia === 6 && x.turnoId === 'tarde')).toMatchObject({
      disponiveis: 5,
      reservados: 2,
    });
  });

  it('datas livres: só fins de semana com vaga, turnos na ordem', () => {
    const livres = datasLivres(cfg, '2026-10-01', '2026-10-12');
    expect(livres).toEqual([
      { data: '2026-10-04', turnoIds: ['tarde'] },
      { data: '2026-10-10', turnoIds: ['noite'] },
    ]);
  });

  it('texto de promoção', () => {
    expect(turnoNaFrase('Tarde')).toBe('à tarde');
    expect(turnoNaFrase('Brunch')).toBe('no turno Brunch');
    expect(
      textoPromocao({
        data: '2026-11-14',
        turnos: ['Tarde'],
        buffet: 'Buffet Alegria',
        link: 'https://x/b/a',
      }),
    ).toBe(
      'Ainda temos o sábado 14/11 à tarde livre no Buffet Alegria! Monte seu orçamento em 2 minutos e garanta a data: https://x/b/a',
    );
    expect(
      textoPromocao({ data: '2026-11-15', turnos: ['Almoço', 'Noite'], buffet: 'B', link: 'L' }),
    ).toContain('o domingo 15/11 no almoço e à noite livre');
  });
});
