import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Canal } from '@/server/avisos/canais/tipos';
import { conectar, urlBancoTeste } from '../support/db';
import {
  criarEmpresaTemporaria,
  removerEmpresa,
  type EmpresaTemporaria,
} from '../support/empresa-temporaria';

/*
 * Processador da fila (src/server/avisos/processar.ts) contra o banco, com canais falsos:
 * envia fora de transação, grava o resultado, código de erro e não trava a fila.
 */

process.env.DATABASE_URL ??= urlBancoTeste();
const sql = conectar();
let e: EmpresaTemporaria;

beforeAll(async () => {
  process.env.DATABASE_URL = urlBancoTeste();
  e = await criarEmpresaTemporaria(sql, 'infantil');
});
afterAll(async () => {
  await sql`delete from public.avisos where empresa_id = ${e.empresaId}`;
  await removerEmpresa(sql, e);
  await sql.end();
});

async function aviso(chave: string, canais: ('push' | 'whatsapp')[]) {
  const [a] = await sql`insert into public.avisos (empresa_id, usuario_id, tipo, chave)
    values (${e.empresaId}, ${e.donoId}, 'teste', ${chave + ':' + e.empresaId}) returning id`;
  for (const canal of canais) {
    await sql`insert into public.avisos_entregas (empresa_id, aviso_id, canal) values (${e.empresaId}, ${a!.id}, ${canal})`;
  }
  return a!.id as string;
}

const entregas = (avisoId: string) =>
  sql`select canal, status, erro_codigo, tentativas from public.avisos_entregas where aviso_id = ${avisoId} order by canal`;

describe('processarAvisos', () => {
  it('envia, registra erro com código e marca canal sem configuração como ignorado', async () => {
    const { processarAvisos } = await import('@/server/avisos/processar');
    const ok = await aviso('proc-ok', ['push', 'whatsapp']);
    const enviados: string[] = [];
    const push: Canal = {
      nome: 'push',
      configurado: () => true,
      enviar: async (x) => {
        enviados.push(x.aviso.id);
        return { resultado: 'enviado' };
      },
    };
    const whatsappDesligado: Canal = {
      nome: 'whatsapp',
      configurado: () => false,
      enviar: async () => ({ resultado: 'enviado' }),
    };
    await processarAvisos({ canais: [push, whatsappDesligado], limite: 200 });
    expect(enviados).toContain(ok);
    expect(await entregas(ok)).toEqual([
      { canal: 'push', status: 'enviado', erro_codigo: null, tentativas: 1 },
      { canal: 'whatsapp', status: 'ignorado', erro_codigo: 'CANAL_DESLIGADO', tentativas: 1 },
    ]);

    const falha = await aviso('proc-falha', ['whatsapp']);
    const meta: Canal = {
      nome: 'whatsapp',
      configurado: () => true,
      enviar: async () => ({ resultado: 'erro', erro: 'META_132001' }),
    };
    const explode: Canal = {
      nome: 'push',
      configurado: () => true,
      enviar: async () => {
        throw new Error('boom');
      },
    };
    const outro = await aviso('proc-excecao', ['push']);
    await processarAvisos({ canais: [explode, meta], limite: 200 });
    expect(await entregas(falha)).toEqual([
      { canal: 'whatsapp', status: 'pendente', erro_codigo: 'META_132001', tentativas: 1 },
    ]);
    expect(await entregas(outro)).toEqual([
      { canal: 'push', status: 'pendente', erro_codigo: 'EXCECAO', tentativas: 1 },
    ]);
  });
});
