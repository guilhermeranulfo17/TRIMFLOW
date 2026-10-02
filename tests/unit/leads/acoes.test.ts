import { describe, expect, it } from 'vitest';
import {
  contarFiltros,
  descreverAtividade,
  filtrosDaUrl,
  filtrosParaSql,
  filtrosParaUrl,
  interpretarQuando,
  montarMensagem,
  quandoAdiar,
  rotuloMotivoPerda,
  situacaoDoMomento,
  temperaturaPorInatividade,
  validarPerda,
  type DadosMensagem,
} from '@/domain/leads';
import { statusAoReabrir, transicaoLead } from '@/domain/publico';

const AGORA = new Date('2026-10-02T13:00:00Z'); // 10:00 em São Paulo
const SP = 'America/Sao_Paulo';

describe('status: eventos do vendedor', () => {
  it('registrar contato tira de novo, abandonou e frio; não mexe em pré-reservado', () => {
    for (const s of ['novo', 'abandonou', 'frio'] as const) {
      expect(transicaoLead({ status: s, temperatura: 'frio' }, 'contato_registrado').status).toBe(
        'em_andamento',
      );
    }
    expect(
      transicaoLead({ status: 'pre_reservado', temperatura: 'quente' }, 'contato_registrado')
        .status,
    ).toBe('pre_reservado');
  });
  it('visita confirmada esquenta; perdido vai para perdido', () => {
    expect(transicaoLead({ status: 'novo', temperatura: 'frio' }, 'visita_confirmada')).toEqual({
      status: 'em_andamento',
      temperatura: 'quente',
    });
    expect(transicaoLead({ status: 'em_andamento', temperatura: 'morno' }, 'perdido').status).toBe(
      'perdido',
    );
  });
  it('reabrir volta ao estado de antes; pré-reservado volta em andamento', () => {
    expect(statusAoReabrir('frio')).toBe('frio');
    expect(statusAoReabrir('novo')).toBe('novo');
    expect(statusAoReabrir('pre_reservado')).toBe('em_andamento');
    expect(statusAoReabrir(null)).toBe('em_andamento');
  });
});

describe('temperatura por inatividade (7 dias)', () => {
  const dias = (d: number) => new Date(AGORA.getTime() - d * 86_400_000);
  it('aberto parado há 7 dias fica frio; fechados não mudam', () => {
    expect(temperaturaPorInatividade('em_andamento', 'quente', dias(7), AGORA)).toBe('frio');
    expect(temperaturaPorInatividade('em_andamento', 'quente', dias(6.9), AGORA)).toBe('quente');
    expect(temperaturaPorInatividade('pre_reservado', 'morno', dias(10), AGORA)).toBe('frio');
    expect(temperaturaPorInatividade('reservado', 'quente', dias(30), AGORA)).toBe('quente');
    expect(temperaturaPorInatividade('perdido', 'morno', dias(30), AGORA)).toBe('morno');
  });
});

describe('motivos de perda', () => {
  it('rótulos e detalhe obrigatório em "outro"', () => {
    expect(rotuloMotivoPerda('preco')).toBe('Preço');
    expect(rotuloMotivoPerda('x')).toBeNull();
    expect(validarPerda('outro', '  ')).toBe('Conte o motivo em poucas palavras.');
    expect(validarPerda('preco', '')).toBeNull();
    expect(validarPerda('preco', 'a'.repeat(301))).toBe('Use no máximo 300 caracteres.');
  });
});

describe('adiar no fuso da empresa', () => {
  it('atalhos', () => {
    expect(quandoAdiar('amanha_9h', AGORA, SP).toISOString()).toBe('2026-10-03T12:00:00.000Z');
    expect(quandoAdiar('em_3_dias', AGORA, SP).toISOString()).toBe('2026-10-05T12:00:00.000Z');
    expect(quandoAdiar('em_1_hora', AGORA, SP).toISOString()).toBe('2026-10-02T14:00:00.000Z');
    expect(quandoAdiar('proxima_semana', AGORA, SP).toISOString()).toBe('2026-10-09T12:00:00.000Z');
  });
  it.each<[string, string | null]>([
    ['amanhã 9h', '2026-10-03T12:00:00.000Z'],
    ['amanha', '2026-10-03T12:00:00.000Z'],
    ['Amanhã às 14h30', '2026-10-03T17:30:00.000Z'],
    ['hoje 18h', '2026-10-02T21:00:00.000Z'],
    ['hoje 8h', null], // já passou
    ['em 3 dias', '2026-10-05T12:00:00.000Z'],
    ['em 1 dia 15:00', '2026-10-03T18:00:00.000Z'],
    ['14/11', '2026-11-14T12:00:00.000Z'],
    ['14/11 15:00', '2026-11-14T18:00:00.000Z'],
    ['01/02', '2027-02-01T12:00:00.000Z'], // sem ano: a próxima
    ['14/11/2026 15h', '2026-11-14T18:00:00.000Z'],
    ['2026-11-14T15:00', '2026-11-14T18:00:00.000Z'],
    ['31/02', null],
    ['qualquer coisa', null],
    ['amanhã 25h', null],
    ['', null],
  ])('"%s"', (texto, esperado) => {
    expect(interpretarQuando(texto, AGORA, SP)?.toISOString() ?? null).toBe(esperado);
  });
});

describe('filtros da caixa ↔ URL', () => {
  it('ida e volta, com validação', () => {
    const url =
      'status=novo,em_andamento,xx&temp=quente&resp=meus&de=2026-11-01&ate=2026-11-30&atrasadas=1&q=ana&ver=visitas&origem=instagram';
    const f = filtrosDaUrl(new URLSearchParams(url));
    expect(f).toEqual({
      status: ['novo', 'em_andamento'],
      temperatura: ['quente'],
      origem: ['instagram'],
      responsavel: 'meus',
      eventoDe: '2026-11-01',
      eventoAte: '2026-11-30',
      atrasadas: true,
      busca: 'ana',
      atalho: 'visitas',
    });
    expect(filtrosDaUrl(new URLSearchParams(filtrosParaUrl(f)))).toEqual(f);
    expect(contarFiltros(f)).toBe(6);
    expect(filtrosParaSql(f)).toMatchObject({
      status: ['novo', 'em_andamento'],
      responsavel: 'meus',
      evento_de: '2026-11-01',
      atalho: 'visitas',
    });
  });
  it('lixo na URL é ignorado', () => {
    expect(
      filtrosDaUrl({ resp: 'drop table', de: '2026-13-01', ver: 'tudo', status: 'x', teste: '0' }),
    ).toEqual({});
    expect(filtrosDaUrl({ resp: '1a000000-0000-4000-8000-000000000002' }).responsavel).toBe(
      '1a000000-0000-4000-8000-000000000002',
    );
    expect(filtrosParaUrl({})).toBe('');
  });
});

describe('mensagens prontas', () => {
  const d: DadosMensagem = {
    nome: 'Ana Souza',
    buffet: 'Buffet Demo',
    vendedor: 'Bia Lima',
    tipoFesta: 'Aniversário infantil',
    dataFesta: '2026-11-14',
    linkProposta: 'https://x.test/b/demo/proposta/abc',
    preReservaExpiraEm: new Date(AGORA.getTime() + 5 * 3_600_000),
    sinalCentavos: 150_000,
    visitaEm: new Date('2026-10-03T18:00:00Z'),
    dataAindaLivre: true,
    fuso: SP,
    agora: AGORA,
  };

  it('primeiro contato', () => {
    expect(montarMensagem('primeiro_contato', d)).toBe(
      'Oi, Ana! Aqui é Bia, do Buffet Demo. Vi que você montou um orçamento para a festa (aniversário infantil) no dia sábado, 14 de novembro de 2026. Posso te ajudar com alguma dúvida? Sua proposta: https://x.test/b/demo/proposta/abc',
    );
  });
  it('proposta aberta sem resposta', () => {
    expect(montarMensagem('proposta_sem_resposta', d)).toContain(
      'Vi que você abriu a proposta do Buffet Demo para o dia sábado, 14 de novembro de 2026.',
    );
  });
  it('pré-reserva vencendo com prazo e sinal', () => {
    expect(montarMensagem('pre_reserva_vencendo', d)).toBe(
      'Oi, Ana! Sua pré-reserva no Buffet Demo para o dia sábado, 14 de novembro de 2026 vence em 5 horas. Para garantir a data, o sinal é de R$ 1.500,00. Posso te mandar os dados para o pagamento?',
    );
  });
  it('confirmação de visita com dia e hora', () => {
    expect(montarMensagem('confirmacao_visita', d)).toBe(
      'Oi, Ana! Confirmando sua visita ao Buffet Demo amanhã às 15h. Se tiver algum imprevisto, é só me avisar por aqui.',
    );
  });
  it('reativar frio só cita a data se ainda estiver livre', () => {
    expect(montarMensagem('reativar_frio', d)).toContain(
      'o dia sábado, 14 de novembro de 2026 ainda está livre',
    );
    const ocupada = montarMensagem('reativar_frio', { ...d, dataAindaLivre: false });
    expect(ocupada).not.toContain('14 de novembro');
    expect(ocupada).toContain('Ainda está planejando a festa (aniversário infantil)?');
  });
  it('variáveis faltando saem do texto', () => {
    const minimo: DadosMensagem = { nome: 'Ana', buffet: 'Buffet Demo', agora: AGORA };
    for (const s of [
      'primeiro_contato',
      'proposta_sem_resposta',
      'pre_reserva_vencendo',
      'confirmacao_visita',
      'reativar_frio',
    ] as const) {
      const t = montarMensagem(s, minimo);
      expect(t).not.toMatch(/undefined|null|NaN|\s{2}|\s[,.]/);
      expect(t.startsWith('Oi, Ana!')).toBe(true);
    }
    expect(montarMensagem('primeiro_contato', minimo)).toBe(
      'Oi, Ana! Aqui é do Buffet Demo. Vi que você montou um orçamento com a gente. Posso te ajudar com alguma dúvida?',
    );
  });
  it('situação do momento', () => {
    const m = {
      status: 'em_andamento' as const,
      temperatura: 'morno' as const,
      preReservaAtiva: false,
      visitaConfirmada: false,
      aberturas: 0,
      temOrcamento: true,
    };
    expect(situacaoDoMomento(m)).toBe('primeiro_contato');
    expect(situacaoDoMomento({ ...m, aberturas: 2 })).toBe('proposta_sem_resposta');
    expect(situacaoDoMomento({ ...m, status: 'frio' })).toBe('reativar_frio');
    expect(situacaoDoMomento({ ...m, visitaConfirmada: true })).toBe('confirmacao_visita');
    expect(situacaoDoMomento({ ...m, preReservaAtiva: true, visitaConfirmada: true })).toBe(
      'pre_reserva_vencendo',
    );
    expect(situacaoDoMomento({ ...m, status: 'novo', temperatura: 'frio' })).toBe(
      'primeiro_contato',
    );
  });
});

describe('linha do tempo: ações do vendedor', () => {
  it.each<[string, Record<string, unknown>, string | null, string]>([
    [
      'contato_registrado',
      { canal: 'ligacao', resumo: 'Vai ver com o marido' },
      'Bia',
      'Bia falou com o cliente por ligação: Vai ver com o marido',
    ],
    ['nota', { trecho: 'Prefere sábado' }, 'Bia', 'Bia anotou: Prefere sábado'],
    ['tarefa_criada', { titulo: 'Mandar fotos' }, 'Bia', 'Bia criou a tarefa "Mandar fotos"'],
    ['tarefa_feita', { titulo: 'Mandar fotos' }, 'Bia', 'Bia concluiu "Mandar fotos"'],
    ['responsavel_alterado', { para_nome: 'Bia' }, 'Bia', 'Bia assumiu o lead'],
    ['responsavel_alterado', { para_nome: 'Caio' }, 'Dona', 'Dona passou o lead para Caio'],
    [
      'perdido',
      { motivo: 'preco', detalhe: 'Achou caro' },
      'Bia',
      'Bia marcou como perdido: Preço (Achou caro)',
    ],
    ['reaberto', {}, 'Bia', 'Bia reabriu o lead'],
    [
      'visita_confirmada',
      { data_hora: '2026-10-03T18:00:00Z' },
      'Bia',
      'Bia confirmou a visita para 03/10/2026 15:00',
    ],
    [
      'visita_confirmada',
      { data_hora: '2026-10-03T18:00:00Z', remarcada: true },
      'Bia',
      'Bia remarcou a visita para 03/10/2026 15:00',
    ],
    ['visita_realizada', {}, 'Bia', 'Visita realizada'],
    ['visita_cancelada', { motivo: 'Chuva' }, null, 'A equipe cancelou a visita: Chuva'],
    [
      'mensagem_copiada',
      { situacao: 'reativar_frio' },
      'Bia',
      'Bia abriu o WhatsApp com a mensagem "Reativar lead frio"',
    ],
  ])('%s', (tipo, dados, quem, texto) => {
    expect(descreverAtividade(tipo, dados, quem)).toBe(texto);
  });
});
