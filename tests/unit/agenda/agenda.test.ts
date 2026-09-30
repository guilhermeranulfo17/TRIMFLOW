import { describe, expect, it } from 'vitest';
import {
  estadoDoSlot,
  intervaloDoSlot,
  limitesDoMes,
  montarCalendario,
  prazoRestante,
  resumirDia,
  sobrepoe,
  somarMes,
  traduzirErroAgenda,
  type Ocupacao,
  type Slot,
  type SlotDisponibilidade,
} from '@/domain/agenda';
import { bloqueioSchema, reservaSchema } from '@/domain/validacao/agenda';

const SP = 'America/Sao_Paulo';
const iso = (d: Date) => d.toISOString();

describe('intervaloDoSlot', () => {
  it('converte data + hora do turno no fuso da empresa e soma duração + intervalo', () => {
    const i = intervaloDoSlot('2026-11-14', { horaInicio: '15:00', duracaoMin: 240 }, SP, 60);
    expect(iso(i.inicio)).toBe('2026-11-14T18:00:00.000Z');
    expect(iso(i.fim)).toBe('2026-11-14T23:00:00.000Z');
  });

  it('turno que passa da meia-noite termina no dia seguinte', () => {
    const i = intervaloDoSlot('2026-11-14', { horaInicio: '22:00', duracaoMin: 300 }, SP, 60);
    expect(iso(i.inicio)).toBe('2026-11-15T01:00:00.000Z');
    expect(iso(i.fim)).toBe('2026-11-15T07:00:00.000Z');
  });

  it('aceita hora com segundos (formato do banco)', () => {
    const i = intervaloDoSlot('2026-11-14', { horaInicio: '15:00:00', duracaoMin: 60 }, SP, 0);
    expect(iso(i.inicio)).toBe('2026-11-14T18:00:00.000Z');
  });

  it('horário de verão histórico de São Paulo (2018/2019)', () => {
    // 2018-12-01: horário de verão (UTC-2).
    const verao = intervaloDoSlot('2018-12-01', { horaInicio: '15:00', duracaoMin: 240 }, SP, 0);
    expect(iso(verao.inicio)).toBe('2018-12-01T17:00:00.000Z');
    // Fim do horário de verão em 2019-02-17 00:00: turno de sábado 22h dura 4h reais.
    const troca = intervaloDoSlot('2019-02-16', { horaInicio: '22:00', duracaoMin: 240 }, SP, 0);
    expect(iso(troca.inicio)).toBe('2019-02-17T00:00:00.000Z');
    expect(troca.fim.getTime() - troca.inicio.getTime()).toBe(4 * 3600_000);
  });
});

describe('sobrepoe', () => {
  const t = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
  it('sobreposição parcial e contida', () => {
    expect(sobrepoe({ inicio: t(10), fim: t(14) }, { inicio: t(13), fim: t(15) })).toBe(true);
    expect(sobrepoe({ inicio: t(10), fim: t(20) }, { inicio: t(12), fim: t(13) })).toBe(true);
  });
  it('encostar não conflita', () => {
    expect(sobrepoe({ inicio: t(10), fim: t(14) }, { inicio: t(14), fim: t(18) })).toBe(false);
    expect(sobrepoe({ inicio: t(14), fim: t(18) }, { inicio: t(10), fim: t(14) })).toBe(false);
  });
});

describe('estadoDoSlot', () => {
  const agora = new Date('2026-10-01T12:00:00Z');
  const slot: Slot = {
    data: '2026-11-14',
    turnoId: 'tarde',
    espacoId: 'salao',
    ...intervaloDoSlot('2026-11-14', { horaInicio: '15:00', duracaoMin: 240 }, SP, 60),
  };
  const ocupacao = (o: Partial<Ocupacao> = {}): Ocupacao => ({
    espacoId: 'salao',
    tipo: 'confirmada',
    status: 'ativa',
    expiraEm: null,
    inicio: slot.inicio,
    fim: slot.fim,
    ...o,
  });

  it('livre sem ocupações', () => {
    expect(estadoDoSlot(slot, [], [], 1, agora)).toEqual({
      estado: 'livre',
      vagas: 1,
      expiraEm: null,
    });
  });

  it('reservado e pré-reservado com capacidade 1', () => {
    expect(estadoDoSlot(slot, [ocupacao()], [], 1, agora).estado).toBe('reservado');
    const expira = new Date('2026-10-02T08:00:00Z');
    expect(
      estadoDoSlot(slot, [ocupacao({ tipo: 'pre_reserva', expiraEm: expira })], [], 1, agora),
    ).toEqual({ estado: 'pre_reservado', vagas: 0, expiraEm: expira });
  });

  it('pré-reserva vencida conta como livre, mesmo com status ativa', () => {
    const vencida = ocupacao({ tipo: 'pre_reserva', expiraEm: new Date('2026-10-01T11:59:00Z') });
    expect(estadoDoSlot(slot, [vencida], [], 1, agora).estado).toBe('livre');
  });

  it('cancelada, vencida e realizada não ocupam', () => {
    const lista = [
      ocupacao({ status: 'cancelada' }),
      ocupacao({ status: 'vencida' }),
      ocupacao({ status: 'realizada' }),
    ];
    expect(estadoDoSlot(slot, lista, [], 1, agora).estado).toBe('livre');
  });

  it('intervalo entre eventos: ocupação que encosta no fim com folga conflita', () => {
    // Evento anterior termina 15:00 + 60 min de limpeza = 16:00 → sobrepõe o slot das 15:00.
    const anterior = ocupacao({
      inicio: new Date('2026-11-14T14:00:00Z'),
      fim: new Date('2026-11-14T19:00:00Z'),
    });
    expect(estadoDoSlot(slot, [anterior], [], 1, agora).estado).toBe('reservado');
    const semFolga = ocupacao({
      inicio: new Date('2026-11-14T14:00:00Z'),
      fim: new Date('2026-11-14T18:00:00Z'),
    });
    expect(estadoDoSlot(slot, [semFolga], [], 1, agora).estado).toBe('livre');
  });

  it('outro espaço não conta', () => {
    expect(estadoDoSlot(slot, [ocupacao({ espacoId: 'jardim' })], [], 1, agora).estado).toBe(
      'livre',
    );
  });

  it('capacidade 2: um evento deixa 1 vaga; dois lotam', () => {
    expect(estadoDoSlot(slot, [ocupacao()], [], 2, agora)).toMatchObject({
      estado: 'livre',
      vagas: 1,
    });
    expect(estadoDoSlot(slot, [ocupacao(), ocupacao()], [], 2, agora)).toMatchObject({
      estado: 'lotado',
      vagas: 0,
    });
  });

  it('bloqueio de dia inteiro, de turno e de espaço', () => {
    const base = { data: '2026-11-14' };
    expect(
      estadoDoSlot(slot, [], [{ ...base, turnoId: null, espacoId: null }], 1, agora).estado,
    ).toBe('bloqueado');
    expect(
      estadoDoSlot(slot, [], [{ ...base, turnoId: 'tarde', espacoId: 'salao' }], 1, agora).estado,
    ).toBe('bloqueado');
    expect(
      estadoDoSlot(slot, [], [{ ...base, turnoId: 'noite', espacoId: null }], 1, agora).estado,
    ).toBe('livre');
    expect(
      estadoDoSlot(slot, [], [{ ...base, turnoId: null, espacoId: 'jardim' }], 1, agora).estado,
    ).toBe('livre');
    expect(
      estadoDoSlot(slot, [], [{ data: '2026-11-15', turnoId: null, espacoId: null }], 1, agora)
        .estado,
    ).toBe('livre');
  });
});

describe('calendário', () => {
  const s = (data: string, estado: SlotDisponibilidade['estado'], vagas = 0, capacidade = 1) => ({
    data,
    estado,
    vagas,
    capacidade,
  });

  it('resumo do dia', () => {
    expect(resumirDia([])).toBe('sem_turno');
    expect(resumirDia([s('d', 'livre', 1), s('d', 'livre', 1)])).toBe('livre');
    expect(resumirDia([s('d', 'livre', 1), s('d', 'reservado')])).toBe('parcial');
    expect(resumirDia([s('d', 'reservado'), s('d', 'pre_reservado')])).toBe('cheio');
    expect(resumirDia([s('d', 'bloqueado'), s('d', 'bloqueado')])).toBe('bloqueado');
    expect(resumirDia([s('d', 'livre', 1, 2)])).toBe('parcial');
  });

  it('monta semanas de domingo a sábado, marcando os dias do mês', () => {
    const cal = montarCalendario('2026-11', [s('2026-11-14', 'reservado')]);
    // novembro/2026 começa num domingo e termina numa segunda
    expect(cal.semanas[0]![0]!.data).toBe('2026-11-01');
    expect(cal.semanas.every((sem) => sem.length === 7)).toBe(true);
    const ultimo = cal.semanas.at(-1)!;
    expect(ultimo.at(-1)!.data).toBe('2026-12-05');
    expect(ultimo.at(-1)!.doMes).toBe(false);
    const dia14 = cal.semanas.flat().find((d) => d.data === '2026-11-14')!;
    expect(dia14).toMatchObject({ resumo: 'cheio', doMes: true });
    expect(dia14.contagem.reservado).toBe(1);
  });

  it('limites e soma de mês', () => {
    expect(limitesDoMes('2028-02')).toEqual({ de: '2028-02-01', ate: '2028-02-29' });
    expect(somarMes('2026-12', 1)).toBe('2027-01');
    expect(somarMes('2026-01', -1)).toBe('2025-12');
  });
});

describe('mensagens e prazo', () => {
  it('traduz códigos do banco', () => {
    expect(traduzirErroAgenda('AGENDA_SLOT_OCUPADO')).toMatch(/já está ocupado/);
    expect(traduzirErroAgenda('outra coisa')).toBeNull();
    expect(traduzirErroAgenda(undefined)).toBeNull();
  });

  it('prazo restante', () => {
    const agora = new Date('2026-10-01T12:00:00Z');
    const mais = (min: number) => new Date(agora.getTime() + min * 60_000);
    expect(prazoRestante(mais(35), agora)).toBe('vence em 35 min');
    expect(prazoRestante(mais(14 * 60 + 20), agora)).toBe('vence em 14h');
    expect(prazoRestante(mais(72 * 60), agora)).toBe('vence em 3 dias');
    expect(prazoRestante(mais(-1), agora)).toBe('vencida');
  });
});

describe('schemas', () => {
  const base = {
    espacoId: '11111111-1111-4111-8111-111111111111',
    turnoId: '11111111-1111-4111-8111-111111111112',
    data: '2026-11-14',
    tipo: 'confirmada' as const,
    clienteNome: 'Maria',
    clienteWhatsapp: '',
    tipoEventoId: '',
    convidados: null,
    valorTotalCentavos: null,
    sinalCentavos: null,
    sinalPagoEm: '',
    observacoes: '',
  };

  it('reserva mínima e erros em português', () => {
    expect(reservaSchema.safeParse(base).success).toBe(true);
    const r = reservaSchema.safeParse({ ...base, clienteNome: '', clienteWhatsapp: '123' });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain('Informe o nome do cliente.');
    expect(msgs).toContain('Informe um celular válido com DDD.');
  });

  it('bloqueio: período em ordem e de no máximo um ano', () => {
    const b = { de: '2026-12-20', ate: '2026-12-22', turnoId: '', espacoId: '', motivo: '' };
    expect(bloqueioSchema.safeParse(b).success).toBe(true);
    expect(bloqueioSchema.safeParse({ ...b, ate: '2026-12-19' }).success).toBe(false);
    expect(bloqueioSchema.safeParse({ ...b, ate: '2027-12-21' }).success).toBe(false);
  });
});
