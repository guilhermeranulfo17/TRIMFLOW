import { describe, expect, it } from 'vitest';
import { diasRestantesTeste, rotuloPlano } from '@/domain/plano';

describe('plano', () => {
  const agora = new Date('2026-10-01T12:00:00Z');

  it('conta os dias restantes do teste arredondando para cima', () => {
    expect(diasRestantesTeste(new Date('2026-10-15T12:00:00Z'), agora)).toBe(14);
    expect(diasRestantesTeste(new Date('2026-10-01T13:00:00Z'), agora)).toBe(1);
    expect(diasRestantesTeste(new Date('2026-09-30T12:00:00Z'), agora)).toBe(0);
    expect(diasRestantesTeste(null, agora)).toBe(0);
  });

  it('descreve a situação', () => {
    expect(rotuloPlano('trial', 14)).toBe('Teste grátis: faltam 14 dias');
    expect(rotuloPlano('trial', 1)).toBe('Teste grátis: falta 1 dia');
    expect(rotuloPlano('trial', 0)).toBe('Teste grátis encerrado');
    expect(rotuloPlano('ativo', 0)).toBe('Assinatura ativa');
    expect(rotuloPlano('suspenso', 3)).toBe('Acesso suspenso');
  });
});
