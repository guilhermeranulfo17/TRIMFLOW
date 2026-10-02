import { describe, expect, it } from 'vitest';
import { textoAviso } from '@/domain/avisos/textos';
import { canaisDoTipo, TIPOS_CONFIGURAVEIS } from '@/domain/avisos/canais';
import { diasRestantesTeste, faixaDaConta, rotuloPlano } from '@/domain/plano';

const agora = new Date('2026-11-10T12:00:00Z');

describe('faixa da conta', () => {
  it('teste só nos últimos 5 dias', () => {
    expect(
      faixaDaConta({ plano: 'trial', trialAte: new Date('2026-11-20T12:00:00Z'), agora }),
    ).toBeNull();
    expect(
      faixaDaConta({ plano: 'trial', trialAte: new Date('2026-11-15T12:00:00Z'), agora }),
    ).toMatchObject({ tipo: 'teste', texto: expect.stringContaining('5 dias') });
    expect(
      faixaDaConta({ plano: 'trial', trialAte: new Date('2026-11-10T20:00:00Z'), agora }),
    ).toMatchObject({ texto: expect.stringContaining('acaba hoje') });
  });

  it('inadimplente, suspenso, cancelado e ativo', () => {
    expect(
      faixaDaConta({ plano: 'inadimplente', trialAte: null, suspendeEm: '2026-11-17', agora }),
    ).toMatchObject({ texto: expect.stringContaining('17/11/2026'), acao: 'Pagar agora' });
    expect(faixaDaConta({ plano: 'inadimplente', trialAte: null, agora })?.texto).toContain(
      'Pague',
    );
    expect(faixaDaConta({ plano: 'suspenso', trialAte: null, agora })?.tipo).toBe('suspenso');
    expect(
      faixaDaConta({ plano: 'cancelado', trialAte: null, pagoAte: '2026-12-01', agora })?.texto,
    ).toContain('01/12/2026');
    expect(faixaDaConta({ plano: 'cancelado', trialAte: null, agora })).toBeNull();
    expect(faixaDaConta({ plano: 'ativo', trialAte: null, agora })).toBeNull();
  });

  it('rótulos', () => {
    expect(rotuloPlano('inadimplente', 0)).toBe('Pagamento em atraso');
    expect(rotuloPlano('cancelado', 0)).toBe('Assinatura cancelada');
    expect(diasRestantesTeste(null)).toBe(0);
  });
});

describe('avisos de cobrança', () => {
  it('vão para a tela de Plano e não são configuráveis', () => {
    const t = textoAviso('fatura_criada', { valor_centavos: 9700, vencimento: '2026-11-15' });
    expect(t).toEqual({
      titulo: 'Fatura do Orkestra',
      corpo:
        'Sua fatura de R$ 97,00 está disponível e vence em 15/11. Pague por Pix, boleto ou cartão.',
      caminho: '/app/empresa/plano',
    });
    expect(TIPOS_CONFIGURAVEIS).not.toContain('fatura_criada');
    expect(canaisDoTipo('carencia', { carencia: [] })).toEqual(['push']);
  });

  it('textos de cada tipo', () => {
    expect(textoAviso('teste_acabando', { dias: 3 }).titulo).toBe('Seu teste acaba em 3 dias');
    expect(textoAviso('teste_acabando', { dias: 1 }).titulo).toBe('Seu teste acaba amanhã');
    expect(textoAviso('pagamento_confirmado', { valor_centavos: 24700 }).corpo).toContain(
      'R$ 247,00',
    );
    expect(
      textoAviso('pagamento_falhou', { valor_centavos: 9700, vencimento: '2026-11-08' }).corpo,
    ).toContain('venceu em 08/11');
    expect(textoAviso('pagamento_falhou', {}).corpo).toContain('A fatura venceu');
    expect(textoAviso('carencia', { suspende_em: '2026-11-17' }).corpo).toContain('17/11');
    expect(textoAviso('carencia', {}).corpo).toContain('em breve');
    expect(textoAviso('conta_suspensa', {}).titulo).toBe('Conta suspensa');
    expect(textoAviso('fatura_criada', {}).corpo).toBe(
      'Sua fatura está disponível. Pague por Pix, boleto ou cartão.',
    );
  });
});
