import { describe, expect, it } from 'vitest';
import { MENSAGEM_GENERICA, mensagemDeErroAuth } from '@/server/erros';

describe('mensagemDeErroAuth', () => {
  it('credenciais inválidas', () => {
    expect(
      mensagemDeErroAuth({
        code: 'invalid_credentials',
        status: 400,
        message: 'Invalid login credentials',
      }),
    ).toBe('E-mail ou senha incorretos.');
  });

  it('e-mail já cadastrado', () => {
    expect(mensagemDeErroAuth({ code: 'user_already_exists' })).toMatch(/Já existe uma conta/);
  });

  it('limite de tentativas por status', () => {
    expect(mensagemDeErroAuth({ status: 429 })).toMatch(/Aguarde/);
  });

  it('falha do trigger de cadastro não vaza detalhe técnico', () => {
    const msg = mensagemDeErroAuth({ status: 500, message: 'Database error saving new user' });
    expect(msg).not.toMatch(/database/i);
    expect(msg).toMatch(/Não foi possível criar sua conta/);
  });

  it('desconhecido vira mensagem genérica em português', () => {
    expect(mensagemDeErroAuth({ message: 'ECONNRESET 10.0.0.1' })).toBe(MENSAGEM_GENERICA);
    expect(mensagemDeErroAuth(null)).toBe(MENSAGEM_GENERICA);
  });
});
