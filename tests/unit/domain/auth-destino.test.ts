import { describe, expect, it } from 'vitest';
import { destinoPosLogin, destinoSeguro, type EstadoPosLogin } from '@/domain/auth/destino';

const base: EstadoPosLogin = {
  temUsuario: true,
  ativo: true,
  trocarSenha: false,
  provedorExterno: true,
  next: null,
};

describe('destinoPosLogin', () => {
  it.each<[string, Partial<EstadoPosLogin>, ReturnType<typeof destinoPosLogin>]>([
    [
      'dono ativo vai ao painel',
      {},
      { tipo: 'painel', url: '/app/leads', limparTrocarSenha: false },
    ],
    [
      'respeita o next interno',
      { next: '/app/agenda' },
      { tipo: 'painel', url: '/app/agenda', limparTrocarSenha: false },
    ],
    [
      'ignora next externo',
      { next: 'https://mal.example' },
      { tipo: 'painel', url: '/app/leads', limparTrocarSenha: false },
    ],
    [
      'ignora next //',
      { next: '//mal.example' },
      { tipo: 'painel', url: '/app/leads', limparTrocarSenha: false },
    ],
    [
      'sem usuário no Orkestra completa o cadastro',
      { temUsuario: false, ativo: false },
      { tipo: 'completar', url: '/cadastro/completar' },
    ],
    [
      'vendedor inativo é barrado (Google)',
      { ativo: false },
      { tipo: 'bloqueado', url: '/login?erro=sem-acesso' },
    ],
    [
      'vendedor inativo é barrado (senha)',
      { ativo: false, provedorExterno: false },
      { tipo: 'bloqueado', url: '/login?erro=sem-acesso' },
    ],
    [
      'senha temporária + Google: entra e limpa o flag',
      { trocarSenha: true },
      { tipo: 'painel', url: '/app/leads', limparTrocarSenha: true },
    ],
    [
      'senha temporária + senha: cria a senha pessoal',
      { trocarSenha: true, provedorExterno: false },
      { tipo: 'nova-senha', url: '/nova-senha' },
    ],
  ])('%s', (_, estado, esperado) => {
    expect(destinoPosLogin({ ...base, ...estado })).toEqual(esperado);
  });
});

describe('destinoSeguro', () => {
  it.each([
    [null, '/app/leads'],
    ['', '/app/leads'],
    ['/app/x', '/app/x'],
    ['//x', '/app/leads'],
    ['/\\x', '/app/leads'],
    ['http://x', '/app/leads'],
  ])('%s → %s', (entrada, saida) => {
    expect(destinoSeguro(entrada)).toBe(saida);
  });
});
