import { describe, expect, it } from 'vitest';
import {
  avaliarRegra,
  prazoValido,
  proximoHorarioComercial,
  type FatosFollowUp,
} from '@/domain/follow-up/regras';
import { situacaoDaRegra, tituloTarefa } from '@/domain/follow-up/titulos';
import { montarMensagem, SITUACOES_AUTOMATICAS } from '@/domain/leads/mensagens';

const SP = 'America/Sao_Paulo';
const local = (iso: string) => new Date(`${iso}-03:00`);
const h = (base: Date, horas: number) => new Date(base.getTime() + horas * 3_600_000);

const BASE: FatosFollowUp = {
  status: 'em_andamento',
  temperatura: 'morno',
  quenteDesde: null,
  propostaEnviadaEm: null,
  orcamentoStatus: null,
  validadeAte: null,
  ultimaAcaoClienteEm: null,
  ultimaAcaoVendedorEm: null,
  preReservaExpiraEm: null,
  preReservaCriadaEm: null,
  visitaEm: null,
  visitaRealizadaEm: null,
  semRespostaFeitaEm: null,
};
const fatos = (p: Partial<FatosFollowUp>): FatosFollowUp => ({ ...BASE, ...p });

describe('sem_resposta_24h', () => {
  const enviada = local('2026-10-01T10:00:00');
  const f = fatos({
    propostaEnviadaEm: enviada,
    orcamentoStatus: 'enviado',
    ultimaAcaoVendedorEm: enviada,
  });
  it('não cria antes de 24h; cria depois', () => {
    expect(avaliarRegra('sem_resposta_24h', f, { agora: h(enviada, 23) })).toBe('nada');
    expect(avaliarRegra('sem_resposta_24h', f, { agora: h(enviada, 24) })).toBe('criar');
  });
  it('prazo editável', () => {
    expect(avaliarRegra('sem_resposta_24h', f, { agora: h(enviada, 7), prazo: 6 })).toBe('criar');
  });
  it('não cria de novo para a mesma proposta', () => {
    expect(
      avaliarRegra('sem_resposta_24h', f, {
        agora: h(enviada, 30),
        tarefaCriadaEm: h(enviada, 24),
      }),
    ).toBe('nada');
  });
  it('cancela quando o vendedor age, o cliente responde, pré-reserva ou o lead fecha', () => {
    const o = { agora: h(enviada, 30), tarefaCriadaEm: h(enviada, 24) };
    expect(
      avaliarRegra('sem_resposta_24h', { ...f, ultimaAcaoVendedorEm: h(enviada, 26) }, o),
    ).toBe('cancelar');
    expect(avaliarRegra('sem_resposta_24h', { ...f, ultimaAcaoClienteEm: h(enviada, 26) }, o)).toBe(
      'cancelar',
    );
    expect(avaliarRegra('sem_resposta_24h', { ...f, status: 'pre_reservado' }, o)).toBe('cancelar');
    expect(avaliarRegra('sem_resposta_24h', { ...f, status: 'perdido' }, o)).toBe('cancelar');
  });
  it('proposta nova (versão) depois da tarefa: a tarefa antiga cancela', () => {
    expect(
      avaliarRegra(
        'sem_resposta_24h',
        { ...f, propostaEnviadaEm: h(enviada, 40), ultimaAcaoVendedorEm: h(enviada, 40) },
        {
          agora: h(enviada, 41),
          tarefaCriadaEm: h(enviada, 24),
        },
      ),
    ).toBe('cancelar');
  });
  it('sem proposta enviada: nada a fazer (cancela se houver)', () => {
    expect(avaliarRegra('sem_resposta_24h', BASE, { agora: enviada })).toBe('cancelar');
  });
});

describe('segundo_toque', () => {
  const feita = local('2026-10-01T10:00:00');
  const f = fatos({
    semRespostaFeitaEm: feita,
    ultimaAcaoVendedorEm: feita,
    propostaEnviadaEm: h(feita, -24),
  });
  it('3 dias depois da tarefa anterior concluída', () => {
    expect(avaliarRegra('segundo_toque', f, { agora: h(feita, 71) })).toBe('nada');
    expect(avaliarRegra('segundo_toque', f, { agora: h(feita, 72) })).toBe('criar');
  });
  it('cancela se o cliente responder', () => {
    expect(
      avaliarRegra(
        'segundo_toque',
        { ...f, ultimaAcaoClienteEm: h(feita, 80) },
        { agora: h(feita, 81), tarefaCriadaEm: h(feita, 72) },
      ),
    ).toBe('cancelar');
  });
});

describe('proposta_vencendo e proposta_vencida', () => {
  const f = fatos({
    propostaEnviadaEm: local('2026-10-01T10:00:00'),
    orcamentoStatus: 'visualizado',
    validadeAte: '2026-10-10',
  });
  it('2 dias antes da validade, às 9h', () => {
    expect(
      avaliarRegra('proposta_vencendo', f, { agora: local('2026-10-08T08:59:00'), fuso: SP }),
    ).toBe('nada');
    expect(
      avaliarRegra('proposta_vencendo', f, { agora: local('2026-10-08T09:00:00'), fuso: SP }),
    ).toBe('criar');
  });
  it('cancela se aceita, vencida ou pré-reservada', () => {
    const o = {
      agora: local('2026-10-09T10:00:00'),
      fuso: SP,
      tarefaCriadaEm: local('2026-10-08T09:00:00'),
    };
    expect(avaliarRegra('proposta_vencendo', { ...f, orcamentoStatus: 'aceito' }, o)).toBe(
      'cancelar',
    );
    expect(avaliarRegra('proposta_vencendo', { ...f, status: 'pre_reservado' }, o)).toBe(
      'cancelar',
    );
    expect(
      avaliarRegra('proposta_vencendo', f, { ...o, agora: local('2026-10-11T10:00:00') }),
    ).toBe('cancelar');
  });
  it('vencida: no dia seguinte ao vencimento, às 9h', () => {
    const v = { ...f, orcamentoStatus: 'expirado' as const, status: 'frio' as const };
    expect(
      avaliarRegra('proposta_vencida', v, { agora: local('2026-10-11T08:00:00'), fuso: SP }),
    ).toBe('nada');
    expect(
      avaliarRegra('proposta_vencida', v, { agora: local('2026-10-11T09:00:00'), fuso: SP }),
    ).toBe('criar');
    expect(
      avaliarRegra(
        'proposta_vencida',
        { ...v, orcamentoStatus: 'enviado' },
        { agora: local('2026-10-11T09:00:00'), fuso: SP },
      ),
    ).toBe('cancelar');
  });
});

describe('pre_reserva_vencendo', () => {
  const criada = local('2026-10-01T10:00:00');
  const f = fatos({
    status: 'pre_reservado',
    preReservaCriadaEm: criada,
    preReservaExpiraEm: h(criada, 48),
  });
  it('12h antes de vencer', () => {
    expect(avaliarRegra('pre_reserva_vencendo', f, { agora: h(criada, 35) })).toBe('nada');
    expect(avaliarRegra('pre_reserva_vencendo', f, { agora: h(criada, 36) })).toBe('criar');
  });
  it('cancela quando confirmada ou cancelada (some a pré-reserva)', () => {
    expect(
      avaliarRegra(
        'pre_reserva_vencendo',
        { ...f, preReservaExpiraEm: null, preReservaCriadaEm: null },
        { agora: h(criada, 40), tarefaCriadaEm: h(criada, 36) },
      ),
    ).toBe('cancelar');
  });
});

describe('visita_amanha e pos_visita', () => {
  const visita = local('2026-10-10T18:00:00');
  it('véspera, às 9h; não cria para visita de hoje', () => {
    const f = fatos({ visitaEm: visita });
    expect(
      avaliarRegra('visita_amanha', f, { agora: local('2026-10-09T08:00:00'), fuso: SP }),
    ).toBe('nada');
    expect(
      avaliarRegra('visita_amanha', f, { agora: local('2026-10-09T09:00:00'), fuso: SP }),
    ).toBe('criar');
    expect(
      avaliarRegra('visita_amanha', f, { agora: local('2026-10-10T09:00:00'), fuso: SP }),
    ).toBe('cancelar');
  });
  it('remarcada para outro dia: a tarefa antiga cancela', () => {
    const f = fatos({ visitaEm: local('2026-10-15T18:00:00') });
    expect(
      avaliarRegra('visita_amanha', f, {
        agora: local('2026-10-09T10:00:00'),
        fuso: SP,
        tarefaCriadaEm: local('2026-10-09T09:00:00'),
      }),
    ).toBe('cancelar');
  });
  it('pós-visita: dia seguinte à visita realizada; cancela com pré-reserva', () => {
    const f = fatos({ visitaRealizadaEm: visita });
    expect(avaliarRegra('pos_visita', f, { agora: local('2026-10-11T09:00:00'), fuso: SP })).toBe(
      'criar',
    );
    expect(
      avaliarRegra(
        'pos_visita',
        { ...f, status: 'pre_reservado' },
        { agora: local('2026-10-11T10:00:00'), fuso: SP },
      ),
    ).toBe('cancelar');
  });
});

describe('quente_sem_contato', () => {
  it('2h depois de esquentar, dentro do horário comercial', () => {
    const q = local('2026-10-02T10:00:00'); // sexta
    const f = fatos({ temperatura: 'quente', quenteDesde: q });
    expect(avaliarRegra('quente_sem_contato', f, { agora: h(q, 1.9), fuso: SP })).toBe('nada');
    expect(avaliarRegra('quente_sem_contato', f, { agora: h(q, 2), fuso: SP })).toBe('criar');
    expect(
      avaliarRegra(
        'quente_sem_contato',
        { ...f, ultimaAcaoVendedorEm: h(q, 1) },
        { agora: h(q, 3), fuso: SP },
      ),
    ).toBe('cancelar');
  });
  it('esquentou às 17h30 de sábado: só segunda às 9h', () => {
    const q = local('2026-10-03T17:30:00');
    const f = fatos({ temperatura: 'quente', quenteDesde: q });
    expect(
      avaliarRegra('quente_sem_contato', f, { agora: local('2026-10-04T12:00:00'), fuso: SP }),
    ).toBe('nada');
    expect(
      avaliarRegra('quente_sem_contato', f, { agora: local('2026-10-05T09:00:00'), fuso: SP }),
    ).toBe('criar');
  });
  it('horário comercial', () => {
    expect(proximoHorarioComercial(local('2026-10-02T20:00:00'), SP)).toEqual(
      local('2026-10-03T09:00:00'),
    );
    expect(proximoHorarioComercial(local('2026-10-02T07:00:00'), SP)).toEqual(
      local('2026-10-02T09:00:00'),
    );
    expect(proximoHorarioComercial(local('2026-10-02T12:00:00'), SP)).toEqual(
      local('2026-10-02T12:00:00'),
    );
  });
});

describe('prazos, títulos e mensagens', () => {
  it('limites do prazo', () => {
    expect(prazoValido('sem_resposta_24h', 24)).toBe(true);
    expect(prazoValido('sem_resposta_24h', 5)).toBe(false);
    expect(prazoValido('visita_amanha', null)).toBe(true);
    expect(prazoValido('visita_amanha', 3)).toBe(false);
  });
  it('títulos com o primeiro nome', () => {
    expect(tituloTarefa('sem_resposta_24h', 'Ana Souza')).toBe(
      'Chamar Ana: recebeu a proposta e não respondeu',
    );
    expect(
      tituloTarefa('visita_amanha', 'Ana', { visitaEm: local('2026-10-10T18:00:00'), fuso: SP }),
    ).toBe('Confirmar a visita de Ana amanhã às 18:00');
  });
  it('mensagem muda se a proposta foi aberta', () => {
    expect(situacaoDaRegra('sem_resposta_24h', true)).toBe('proposta_sem_resposta');
    expect(situacaoDaRegra('sem_resposta_24h', false)).toBe('proposta_nao_aberta');
  });
  it('segundo toque só cita a data se ela estiver livre', () => {
    const d = { nome: 'Ana', buffet: 'Buffet Demo', dataFesta: '2026-11-14' };
    expect(montarMensagem('segundo_toque', { ...d, dataAindaLivre: true })).toContain(
      'Ainda temos o dia sábado, 14 de novembro de 2026 livre',
    );
    expect(montarMensagem('segundo_toque', { ...d, dataAindaLivre: false })).not.toContain(
      '14 de novembro',
    );
  });
  it('mensagens automáticas sem buracos', () => {
    for (const s of SITUACOES_AUTOMATICAS) {
      const m = montarMensagem(s, { nome: 'Ana Souza', buffet: 'Buffet Demo' });
      expect(m).toMatch(/^Oi, Ana!/);
      expect(m).not.toMatch(/undefined|null/);
    }
    expect(
      montarMensagem('proposta_vencendo', { nome: 'Ana', buffet: 'B', validadeAte: '2026-10-10' }),
    ).toContain('vale até sábado, 10 de outubro de 2026');
  });
});
