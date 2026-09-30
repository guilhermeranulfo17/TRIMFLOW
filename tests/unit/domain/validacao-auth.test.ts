import { describe, expect, it } from 'vitest';
import { cadastroSchema, loginSchema, novaSenhaSchema } from '@/domain/validacao/auth';

const valido = {
  nome: 'Ana Souza',
  email: 'Ana@Exemplo.com ',
  whatsapp: '(34) 99135-5450',
  senha: 'senha-forte',
  nomeBuffet: 'Buffet Alegria & Cia',
  segmento: 'infantil',
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
