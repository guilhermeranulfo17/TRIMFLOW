import { describe, expect, it } from 'vitest';
import {
  grupoDoLead,
  limitesDoDia,
  motivoPrioridade,
  ordemNoGrupo,
  ordenarCaixa,
  type EntradaPrioridade,
} from '@/domain/leads';

// 2026-10-02 10:00 em São Paulo (13:00 UTC)
const AGORA = new Date('2026-10-02T13:00:00Z');
const h = (horas: number) => new Date(AGORA.getTime() + horas * 3_600_000);
const L = limitesDoDia(AGORA, 'America/Sao_Paulo');

const base: EntradaPrioridade = {
  status: 'em_andamento',
  temperatura: 'morno',
  preReservaExpiraEm: null,
  visitaPedida: false,
  visitaProxima: null,
  tarefaVence: null,
  primeiroContatoEm: h(-48),
  proximoContatoEm: null,
  criadoEm: h(-72),
  ultimaAtividadeEm: h(-5),
};
const lead = (p: Partial<EntradaPrioridade>): EntradaPrioridade => ({ ...base, ...p });

describe('limites do dia no fuso da empresa', () => {
  it('fim de hoje e de amanhã são meias-noites em São Paulo', () => {
    expect(L.fimHoje.toISOString()).toBe('2026-10-03T03:00:00.000Z');
    expect(L.fimAmanha.toISOString()).toBe('2026-10-04T03:00:00.000Z');
  });
});

describe('grupo de cada lead', () => {
  it.each<[string, Partial<EntradaPrioridade>, number]>([
    ['pré-reserva ativa', { status: 'pre_reservado', preReservaExpiraEm: h(5) }, 1],
    ['pré-reserva vencida não conta', { status: 'pre_reservado', preReservaExpiraEm: h(-1) }, 7],
    ['visita pedida', { visitaPedida: true }, 2],
    ['visita confirmada amanhã', { visitaProxima: h(30) }, 2],
    ['visita confirmada depois de amanhã não', { visitaProxima: h(70) }, 7],
    ['tarefa atrasada', { tarefaVence: h(-3) }, 3],
    ['tarefa de hoje', { tarefaVence: h(8) }, 3],
    ['tarefa de amanhã não', { tarefaVence: h(20) }, 7],
    ['quente', { temperatura: 'quente' }, 4],
    ['novo sem contato', { status: 'novo', primeiroContatoEm: null }, 5],
    ['novo com contato', { status: 'novo' }, 7],
    ['próximo contato vencido', { proximoContatoEm: h(-1) }, 6],
    ['próximo contato futuro', { proximoContatoEm: h(5) }, 7],
    ['abandonou', { status: 'abandonou' }, 7],
    ['frio', { status: 'frio', temperatura: 'frio' }, 7],
    ['reservado fica fora', { status: 'reservado', temperatura: 'quente', visitaPedida: true }, 8],
    ['perdido fica fora', { status: 'perdido', preReservaExpiraEm: h(5) }, 8],
  ])('%s', (_, p, esperado) => {
    expect(grupoDoLead(lead(p), AGORA, L)).toBe(esperado);
  });

  it('a ordem do documento vale nos empates entre sinais', () => {
    // pré-reserva vence visita, que vence tarefa, que vence quente
    expect(
      grupoDoLead(
        lead({ preReservaExpiraEm: h(2), visitaPedida: true, temperatura: 'quente' }),
        AGORA,
        L,
      ),
    ).toBe(1);
    expect(grupoDoLead(lead({ visitaPedida: true, tarefaVence: h(-1) }), AGORA, L)).toBe(2);
    expect(grupoDoLead(lead({ tarefaVence: h(-1), temperatura: 'quente' }), AGORA, L)).toBe(3);
  });
});

describe('ordem dentro do grupo', () => {
  it('pré-reserva que vence primeiro no topo; novo que espera há mais tempo primeiro', () => {
    const lista = ordenarCaixa(
      [
        { ...lead({ preReservaExpiraEm: h(30) }), id: 'b' },
        { ...lead({ preReservaExpiraEm: h(5) }), id: 'a' },
        { ...lead({ status: 'novo', primeiroContatoEm: null, criadoEm: h(-2) }), id: 'n2' },
        { ...lead({ status: 'novo', primeiroContatoEm: null, criadoEm: h(-50) }), id: 'n1' },
        { ...lead({ temperatura: 'quente', ultimaAtividadeEm: h(-10) }), id: 'q2' },
        { ...lead({ temperatura: 'quente', ultimaAtividadeEm: h(-1) }), id: 'q1' },
        { ...lead({ ultimaAtividadeEm: h(-1) }), id: 'x' },
      ],
      AGORA,
    );
    expect(lista.map((l) => l.id)).toEqual(['a', 'b', 'q1', 'q2', 'n1', 'n2', 'x']);
  });

  it('empate exato desempata pelo id', () => {
    const lista = ordenarCaixa(
      [
        { ...lead({ temperatura: 'quente' }), id: 'z' },
        { ...lead({ temperatura: 'quente' }), id: 'k' },
      ],
      AGORA,
    );
    expect(lista.map((l) => l.id)).toEqual(['k', 'z']);
  });

  it('ordem em segundos, como o extract(epoch) do SQL', () => {
    expect(ordemNoGrupo(1, lead({ preReservaExpiraEm: h(1) }))).toBe(h(1).getTime() / 1000);
    expect(ordemNoGrupo(7, lead({}))).toBe(-h(-5).getTime() / 1000);
  });
});

describe('motivo legível do cartão', () => {
  const m = (p: Partial<EntradaPrioridade>) => {
    const e = lead(p);
    return motivoPrioridade(grupoDoLead(e, AGORA, L), e, AGORA, 'America/Sao_Paulo');
  };
  it.each<[Partial<EntradaPrioridade>, string]>([
    [{ preReservaExpiraEm: h(5.5) }, 'Pré-reserva vence em 5h'],
    [{ preReservaExpiraEm: h(0.5) }, 'Pré-reserva vence em 30 min'],
    [{ preReservaExpiraEm: h(72) }, 'Pré-reserva vence em 3 dias'],
    [{ visitaPedida: true }, 'Pediu visita'],
    [{ visitaProxima: h(5) }, 'Visita hoje às 15:00'],
    [{ visitaProxima: h(24) }, 'Visita amanhã às 10:00'],
    [{ tarefaVence: h(-1) }, 'Tarefa atrasada'],
    [{ tarefaVence: h(4) }, 'Tarefa hoje às 14:00'],
    [{ temperatura: 'quente', aberturas: 3 }, 'Abriu a proposta 3x'],
    [{ temperatura: 'quente', aberturas: 1 }, 'Lead quente'],
    [{ status: 'novo', primeiroContatoEm: null, criadoEm: h(-50) }, 'Esperando há 2 dias'],
    [{ status: 'novo', primeiroContatoEm: null, criadoEm: h(-3) }, 'Esperando há 3h'],
    [{ status: 'novo', primeiroContatoEm: null, criadoEm: h(0) }, 'Chegou agora'],
    [{ proximoContatoEm: h(-2) }, 'Próximo contato vencido'],
    [{ status: 'abandonou' }, 'Parou no meio do orçamento'],
    [{ ultimaAtividadeEm: h(-26) }, 'Última atividade há 1 dia'],
    [{ status: 'reservado' }, 'Reservado'],
  ])('%j → %s', (p, texto) => {
    expect(m(p)).toBe(texto);
  });
});
