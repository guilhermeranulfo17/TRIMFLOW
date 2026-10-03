import { describe, expect, it } from 'vitest';
import { loginSchema, novaSenhaSchema } from '@/domain/validacao/auth';
import { cadastroSchema, completarSchema } from '@/domain/validacao/cadastro';

const valido = {
  nome: 'Ana Souza',
  email: 'Ana@Exemplo.com ',
  whatsapp: '(34) 99135-5450',
  senha: 'senha-forte',
  nomeBuffet: 'Buffet Alegria & Cia',
  segmento: 'infantil',
  aceite: true,
};

describe('cadastroSchema', () => {
  it('aceita e normaliza e-mail', () => {
    const r = cadastroSchema.parse(valido);
    expect(r.email).toBe('ana@exemplo.com');
  });

  it('exige celular válido', () => {
    const r = cadastroSchema.safeParse({ ...valido, whatsapp: '(34) 3213-5450' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Informe um celular válido com DDD');
  });

  it('exige senha de 8+ caracteres', () => {
    const r = cadastroSchema.safeParse({ ...valido, senha: '123' });
    expect(r.success).toBe(false);
  });

  it('rejeita segmento desconhecido', () => {
    const r = cadastroSchema.safeParse({ ...valido, segmento: 'pizzaria' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Escolha o tipo de buffet');
  });
});

describe('aceite dos termos e completar (Google)', () => {
  it('cadastro sem aceite é recusado com mensagem clara', () => {
    const r = cadastroSchema.safeParse({ ...valido, aceite: false });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Para criar a conta, aceite os termos de uso.');
  });

  it('completar pede só os dados do buffet (sem e-mail e senha)', () => {
    const { email: _e, senha: _s, ...dados } = valido;
    expect(completarSchema.safeParse(dados).success).toBe(true);
    expect(completarSchema.safeParse({ ...dados, aceite: false }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('mensagens em português', () => {
    const r = loginSchema.safeParse({ email: 'x', senha: '' });
    expect(r.success).toBe(false);
    const mensagens = r.error?.issues.map((i) => i.message);
    expect(mensagens).toContain('E-mail inválido');
    expect(mensagens).toContain('Informe sua senha');
  });
});

describe('novaSenhaSchema', () => {
  it('confirmação precisa bater', () => {
    const r = novaSenhaSchema.safeParse({ senha: 'abcdefgh', confirmacao: 'abcdefgX' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['confirmacao']);
  });
});
