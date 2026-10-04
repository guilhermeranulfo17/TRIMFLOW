import { describe, expect, it } from 'vitest';
import { linhaDeLog, mascararTexto } from '@/domain/observabilidade/log';

describe('log estruturado', () => {
  it('JSON numa linha com nível, evento e id da requisição', () => {
    const l = JSON.parse(
      linhaDeLog('erro', 'lgpd.aceite', { codigo: '42501', n: 2 }, 'req-1', new Date(0)),
    );
    expect(l).toEqual({
      t: '1970-01-01T00:00:00.000Z',
      nivel: 'erro',
      evento: 'lgpd.aceite',
      req: 'req-1',
      codigo: '42501',
      n: 2,
    });
  });

  it('descarta chaves pessoais e mascara e-mail e telefone nos valores', () => {
    const l = JSON.parse(
      linhaDeLog('info', 'x', {
        nome: 'Ana',
        email: 'a@b.com',
        lead_nome: 'Ana',
        whatsapp_e164: '+5534991113304',
        detalhe: 'falhou para ana@exemplo.com.br e (34) 99111-3304',
        empresa_id: '11111111-1111-4111-8111-111111111111',
      }),
    );
    expect(l.nome).toBeUndefined();
    expect(l.email).toBeUndefined();
    expect(l.lead_nome).toBeUndefined();
    expect(l.whatsapp_e164).toBeUndefined();
    expect(l.detalhe).toBe('falhou para [email] e [numero]');
    expect(l.empresa_id).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('números curtos (códigos, valores) ficam', () => {
    expect(mascararTexto('erro 23505 em 3 tentativas')).toBe('erro 23505 em 3 tentativas');
  });
});
