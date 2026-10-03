import { describe, expect, it } from 'vitest';
import { cobrancaDisponivel, configAsaas, URL_ASAAS } from '@/server/cobranca/config';
import { tokenConfere } from '@/server/cobranca/webhook';

describe('configAsaas', () => {
  const base = { ASAAS_API_KEY: 'k', ASAAS_AMBIENTE: 'sandbox', ASAAS_WEBHOOK_TOKEN: 't' };

  it('desligada sem as três variáveis ou com ambiente inválido', () => {
    expect(configAsaas({})).toBeNull();
    expect(configAsaas({ ...base, ASAAS_WEBHOOK_TOKEN: ' ' })).toBeNull();
    expect(configAsaas({ ...base, ASAAS_AMBIENTE: 'teste' })).toBeNull();
    expect(cobrancaDisponivel({})).toBe(false);
  });

  it('URL por ambiente; API falsa só no sandbox', () => {
    expect(configAsaas(base)?.urlBase).toBe(URL_ASAAS.sandbox);
    expect(configAsaas({ ...base, ASAAS_API_URL: 'http://localhost:4010/v3/' })?.urlBase).toBe(
      'http://localhost:4010/v3',
    );
    expect(
      configAsaas({ ...base, ASAAS_AMBIENTE: 'producao', ASAAS_API_URL: 'http://mal.com' })
        ?.urlBase,
    ).toBe(URL_ASAAS.producao);
  });

  it('token do webhook: tempo constante e sem vazio', () => {
    expect(tokenConfere('abc', 'abc')).toBe(true);
    expect(tokenConfere('abd', 'abc')).toBe(false);
    expect(tokenConfere('abcd', 'abc')).toBe(false);
    expect(tokenConfere(null, 'abc')).toBe(false);
    expect(tokenConfere('', '')).toBe(false);
  });
});
