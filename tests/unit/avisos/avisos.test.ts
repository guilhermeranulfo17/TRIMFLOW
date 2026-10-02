import { describe, expect, it } from 'vitest';
import { deveAgrupar } from '@/domain/avisos/agrupamento';
import {
  CANAIS_PADRAO,
  canaisDisponiveis,
  canaisDoTipo,
  TIPOS_AVISO,
} from '@/domain/avisos/canais';
import { destinatariosDoLead } from '@/domain/avisos/destinatario';
import { agendarAviso, horaValida } from '@/domain/avisos/silencio';
import {
  prazoCurto,
  quandoCurto,
  resumoTemConteudo,
  textoAviso,
  variaveisWhatsApp,
} from '@/domain/avisos/textos';

const SP = 'America/Sao_Paulo';
// 2026-10-02 é sexta; 13:00Z = 10:00 em São Paulo
const AGORA = new Date('2026-10-02T13:00:00Z');
const local = (iso: string) => new Date(`${iso}-03:00`);

describe('horário de silêncio', () => {
  it('fora do silêncio sai na hora', () => {
    expect(agendarAviso(local('2026-10-02T10:00:00'), '22:00', '07:00', SP)).toEqual(
      local('2026-10-02T10:00:00'),
    );
  });
  it('às 23h (silêncio que atravessa a meia-noite) sai às 7h do dia seguinte', () => {
    expect(agendarAviso(local('2026-10-02T23:00:00'), '22:00', '07:00', SP)).toEqual(
      local('2026-10-03T07:00:00'),
    );
  });
  it('de madrugada sai às 7h do mesmo dia', () => {
    expect(agendarAviso(local('2026-10-03T03:15:00'), '22:00', '07:00', SP)).toEqual(
      local('2026-10-03T07:00:00'),
    );
  });
  it('limites: 22:00 já é silêncio; 07:00 já não é', () => {
    expect(agendarAviso(local('2026-10-02T22:00:00'), '22:00', '07:00', SP)).toEqual(
      local('2026-10-03T07:00:00'),
    );
    expect(agendarAviso(local('2026-10-03T07:00:00'), '22:00', '07:00', SP)).toEqual(
      local('2026-10-03T07:00:00'),
    );
  });
  it('silêncio no mesmo dia (13:00 às 14:00) e silêncio desligado (início = fim)', () => {
    expect(agendarAviso(local('2026-10-02T13:30:00'), '13:00', '14:00', SP)).toEqual(
      local('2026-10-02T14:00:00'),
    );
    expect(agendarAviso(local('2026-10-02T15:00:00'), '13:00', '14:00', SP)).toEqual(
      local('2026-10-02T15:00:00'),
    );
    expect(agendarAviso(local('2026-10-02T23:00:00'), '00:00', '00:00', SP)).toEqual(
      local('2026-10-02T23:00:00'),
    );
  });
  it('valida HH:mm', () => {
    expect(horaValida('22:00')).toBe(true);
    expect(horaValida('24:00')).toBe(false);
    expect(horaValida('7:00')).toBe(false);
  });
});

describe('canais', () => {
  it('padrões da etapa', () => {
    expect(CANAIS_PADRAO.pre_reserva_pedida).toEqual(['push', 'whatsapp']);
    expect(CANAIS_PADRAO.orcamentos_sem_acao).toEqual(['push']);
    expect(CANAIS_PADRAO.cliente_parou).toEqual([]);
  });
  it('preferência salva vence o padrão; tipo sem modelo nunca vai para o WhatsApp', () => {
    expect(canaisDoTipo('pre_reserva_pedida', { pre_reserva_pedida: ['push'] })).toEqual(['push']);
    expect(canaisDoTipo('pre_reserva_pedida', { pre_reserva_pedida: [] })).toEqual([]);
    expect(canaisDoTipo('cliente_parou', { cliente_parou: ['push', 'whatsapp'] })).toEqual([
      'push',
    ]);
    expect(canaisDoTipo('visita_pedida', null)).toEqual(['push', 'whatsapp']);
    expect(canaisDisponiveis('orcamentos_sem_acao')).toEqual(['push']);
  });
  it('aviso de teste ignora a preferência (sai em todos os canais)', () => {
    expect(canaisDoTipo('teste', { teste: [] })).toEqual(['push', 'whatsapp']);
  });
});

describe('destinatário', () => {
  const donos = [
    { id: 'dono1', receberDeVendedores: false },
    { id: 'dono2', receberDeVendedores: true },
  ];
  it('com responsável: ele e os donos que pediram para receber também', () => {
    expect(destinatariosDoLead('vend', donos)).toEqual(['vend', 'dono2']);
  });
  it('sem responsável: todos os donos', () => {
    expect(destinatariosDoLead(null, donos)).toEqual(['dono1', 'dono2']);
  });
  it('dono responsável não recebe em dobro', () => {
    expect(destinatariosDoLead('dono2', donos)).toEqual(['dono2']);
  });
});

describe('agrupamento', () => {
  it('10 minutos', () => {
    expect(deveAgrupar(new Date(AGORA.getTime() - 9 * 60_000), AGORA)).toBe(true);
    expect(deveAgrupar(new Date(AGORA.getTime() - 10 * 60_000), AGORA)).toBe(false);
    expect(deveAgrupar(null, AGORA)).toBe(false);
  });
});

describe('textos', () => {
  const pre = {
    lead_nome: 'Ana Souza',
    tipo_evento: 'Festa infantil',
    data: '2026-11-14',
    turno: 'Tarde',
    convidados: 80,
    total_centavos: 703237,
    expira_em: new Date(AGORA.getTime() + 48 * 3_600_000).toISOString(),
  };
  it('pré-reserva pedida no formato do documento', () => {
    expect(textoAviso('pre_reserva_pedida', pre, { leadId: 'L1', agora: AGORA }).corpo).toBe(
      'Pré-reserva: Ana Souza, Festa infantil, sáb 14/11 tarde, 80 pessoas, R$ 7.032,37. Vence em 48h.',
    );
    expect(textoAviso('pre_reserva_pedida', pre, { leadId: 'L1' }).caminho).toBe('/app/leads/L1');
  });
  it('visita pedida', () => {
    expect(
      textoAviso(
        'visita_pedida',
        {
          lead_nome: 'Ana Souza',
          data_preferida: '2026-11-05',
          periodo: 'tarde',
          total_centavos: 703237,
        },
        { agora: AGORA },
      ).corpo,
    ).toBe('Visita pedida: Ana Souza, prefere qui 05/11 à tarde. Orçamento de R$ 7.032,37.');
  });
  it('pré-reserva vencendo, orçamentos sem ação, parou, esquentou', () => {
    const amanha14 = local('2026-10-03T14:00:00').toISOString();
    expect(
      textoAviso(
        'pre_reserva_vencendo',
        { lead_nome: 'Ana', expira_em: amanha14 },
        { agora: AGORA, fuso: SP },
      ).corpo,
    ).toBe('A pré-reserva de Ana vence amanhã às 14:00. Hora de cobrar o sinal.');
    expect(
      textoAviso('orcamentos_sem_acao', { quantidade: 3, total_centavos: 1840000 }).corpo,
    ).toBe('3 orçamentos novos sem resposta, R$ 18.400,00 no total.');
    expect(textoAviso('cliente_parou', { lead_nome: 'Ana', passo: 4 }).corpo).toBe(
      'Ana parou no passo 4 (pacote).',
    );
    expect(textoAviso('cliente_esquentou', { lead_nome: 'Ana', aberturas: 3 }).corpo).toBe(
      'Ana abriu a proposta 3 vezes.',
    );
  });
  it('resumo diário pula o que é zero e não sai zerado', () => {
    const d = {
      novos_ontem: 4,
      pre_reservas_hoje: 2,
      visitas_hoje: 1,
      tarefas_hoje: 0,
      atrasadas: 1,
    };
    expect(textoAviso('resumo_diario', d).corpo).toBe(
      'Hoje: 2 pré-reservas vencem, 1 visita, 1 tarefa atrasada. Ontem chegaram 4 leads novos.',
    );
    expect(resumoTemConteudo(d)).toBe(true);
    expect(resumoTemConteudo({ novos_ontem: 0 })).toBe(false);
  });
  it('dados faltando nunca viram "undefined"', () => {
    for (const t of TIPOS_AVISO) {
      const { titulo, corpo } = textoAviso(t, {});
      expect(`${titulo} ${corpo}`).not.toMatch(/undefined|null|NaN/);
    }
  });
  it('agrupado mostra quantas vezes', () => {
    expect(textoAviso('visita_pedida', { lead_nome: 'Ana' }, { agrupados: 2 }).corpo).toContain(
      '(2 vezes)',
    );
  });
  it('variáveis do WhatsApp na ordem dos modelos', () => {
    expect(variaveisWhatsApp('pre_reserva_pedida', pre, { agora: AGORA })).toEqual([
      'Ana Souza',
      'Festa infantil',
      'sáb 14/11 tarde',
      '80',
      'R$ 7.032,37',
      '48h',
    ]);
    expect(variaveisWhatsApp('teste', {})).toEqual([]);
  });
  it('prazos curtos', () => {
    expect(prazoCurto(new Date(AGORA.getTime() + 30 * 60_000), AGORA)).toBe('30 min');
    expect(quandoCurto(local('2026-10-02T18:00:00'), AGORA, SP)).toBe('hoje às 18:00');
    expect(quandoCurto(local('2026-10-10T18:00:00'), AGORA, SP)).toBe('sáb 10/10 às 18:00');
  });
});
