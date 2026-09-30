import { describe, expect, it } from 'vitest';
import { destinoSeguro, ehRotaProtegida, ehRotaSoVisitante } from '@/server/auth/redirecionamento';

describe('destinoSeguro', () => {
  it.each([
    [undefined, '/app/leads'],
    [null, '/app/leads'],
    ['', '/app/leads'],
    ['/app/agenda', '/app/agenda'],
    ['/app/leads?x=1', '/app/leads?x=1'],
    ['//evil.com', '/app/leads'],
    ['/\\evil.com', '/app/leads'],
    ['https://evil.com', '/app/leads'],
    ['app/leads', '/app/leads'],
  ])('%s → %s', (entrada, esperado) => {
    expect(destinoSeguro(entrada)).toBe(esperado);
  });
});

describe('rotas', () => {
  it('protege /app e subrotas', () => {
    expect(ehRotaProtegida('/app')).toBe(true);
    expect(ehRotaProtegida('/app/leads')).toBe(true);
    expect(ehRotaProtegida('/aplicativo')).toBe(false);
    expect(ehRotaProtegida('/b/buffet-demo')).toBe(false);
  });

  it('login e cadastro são só para visitantes', () => {
    expect(ehRotaSoVisitante('/login')).toBe(true);
    expect(ehRotaSoVisitante('/cadastro')).toBe(true);
    expect(ehRotaSoVisitante('/recuperar-senha')).toBe(false);
    expect(ehRotaSoVisitante('/nova-senha')).toBe(false);
  });
});
