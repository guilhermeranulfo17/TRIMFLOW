import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { conectar, IDS, urlBancoTeste } from '../support/db';
import {
  criarEmpresaTemporaria,
  removerEmpresa,
  type EmpresaTemporaria,
} from '../support/empresa-temporaria';

/*
 * Etapa 9.5 (C): volta do login pelo Google, com o banco de verdade (quem existe e está ativo)
 * e o Supabase simulado. E-mail existente cai na conta certa; vendedor desativado continua
 * barrado; quem não tem conta vai completar o cadastro; senha temporária é liberada.
 */

process.env.DATABASE_URL = urlBancoTeste();
const sql = conectar();
let temp: EmpresaTemporaria;

beforeAll(async () => {
  temp = await criarEmpresaTemporaria(sql, 'infantil');
  await sql`update public.usuarios set ativo = false where id = ${temp.vendedorId}`;
});
afterAll(async () => {
  await removerEmpresa(sql, temp);
  await sql.end();
});

async function simular(
  usuario: { id: string; app_metadata?: Record<string, unknown> } | null,
  o: { code?: string | null; next?: string | null; trocaFalha?: boolean } = {},
) {
  const { decidirVoltaExterna } = await import('@/server/auth/volta-externa');
  const { situacaoParaLogin } = await import('@/server/db/admin');
  const chamadas: string[] = [];
  const url = await decidirVoltaExterna(
    {
      trocarCodigo: async () => !o.trocaFalha,
      usuario: async () => (usuario ? { app_metadata: {}, ...usuario } : null),
      situacao: situacaoParaLogin,
      limparTrocarSenha: async (id) => void chamadas.push(`limpar:${id}`),
      renovar: async () => void chamadas.push('renovar'),
      sair: async () => void chamadas.push('sair'),
    },
    o.code === undefined ? 'codigo' : o.code,
    o.next ?? null,
  );
  return { url, chamadas };
}

describe('volta do login pelo Google', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});

  it('e-mail que já tem conta (dono do seed) entra no painel, respeitando o next interno', async () => {
    expect(await simular({ id: IDS.donoA })).toEqual({ url: '/app/leads', chamadas: [] });
    expect((await simular({ id: IDS.donoA }, { next: '/app/agenda' })).url).toBe('/app/agenda');
    expect((await simular({ id: IDS.donoA }, { next: 'https://mal.example' })).url).toBe(
      '/app/leads',
    );
  });

  it('vendedor desativado continua barrado: sessão encerrada', async () => {
    expect(await simular({ id: temp.vendedorId })).toEqual({
      url: '/login?erro=sem-acesso',
      chamadas: ['sair'],
    });
  });

  it('sem conta no Orkestra vai completar o cadastro', async () => {
    expect((await simular({ id: randomUUID() })).url).toBe('/cadastro/completar');
  });

  it('senha temporária + Google: libera o flag e renova o token antes de entrar', async () => {
    const r = await simular({ id: IDS.vendedorA, app_metadata: { trocar_senha: true } });
    expect(r).toEqual({
      url: '/app/leads',
      chamadas: [`limpar:${IDS.vendedorA}`, 'renovar'],
    });
  });

  it('sem code, troca recusada ou sem usuário: volta ao login com aviso', async () => {
    expect((await simular({ id: IDS.donoA }, { code: null })).url).toBe('/login?erro=google');
    expect((await simular({ id: IDS.donoA }, { trocaFalha: true })).url).toBe('/login?erro=google');
    expect((await simular(null)).url).toBe('/login?erro=google');
  });
});
