import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { modeloDoSegmento } from '@/domain/modelos';
import { lerUsuario, type UsuarioAtual } from '@/server/auth/sessao';
import { gravarModelo } from '@/server/catalogo/gravar-modelo';
import { comUsuario } from '@/server/db/tenant';
import { podeTrocarModelo } from '@/server/onboarding/carregar';
import { trocarModelo } from '@/server/onboarding/trocar-modelo';
import { conectar, urlBancoTeste } from '../support/db';
import {
  confirmarPrecosDoModelo,
  criarEmpresaTemporaria,
  removerEmpresa,
  type EmpresaTemporaria,
} from '../support/empresa-temporaria';

/* Fase 6: trocar o modelo de exemplo no passo 1 (ex.: infantil por casamento e 15 anos). */

process.env.DATABASE_URL ??= urlBancoTeste();
const sql = conectar();
let e: EmpresaTemporaria;
let dono: UsuarioAtual;

beforeAll(async () => {
  e = await criarEmpresaTemporaria(sql, 'infantil');
  dono = { ...(await lerUsuario(e.donoId))!, suporte: null } as UsuarioAtual;
  await gravarModelo(comUsuario, e.donoId, e.empresaId, modeloDoSegmento('infantil'));
});

afterAll(async () => {
  await removerEmpresa(sql, e);
  await sql.end();
});

describe('trocar o modelo no onboarding', () => {
  it('catálogo só de exemplo: troca para casamento e 15 anos, com o segmento e auditoria', async () => {
    expect(await podeTrocarModelo(dono)).toBe(true);
    const nome = await comUsuario(e.donoId, (tx) => trocarModelo(tx, dono, 'casamento'));
    expect(nome).toBe('Casamento e 15 anos');
    const tipos = await sql`select nome from public.tipos_evento where empresa_id = ${e.empresaId}
      order by ordem`;
    expect(tipos.map((t) => t.nome)).toEqual(['Casamento', '15 anos', 'Bodas']);
    const pacotes = await sql`select nome, preco_confirmado_em from public.pacotes
      where empresa_id = ${e.empresaId} order by ordem`;
    expect(pacotes.map((p) => p.nome)).toEqual(['Clássico', 'Premium', 'Gala']);
    // preço de exemplo continua fora do link até o dono confirmar
    expect(pacotes.every((p) => p.preco_confirmado_em === null)).toBe(true);
    const [emp] = await sql`select segmento from public.empresas where id = ${e.empresaId}`;
    expect(emp!.segmento).toBe('eventos');
    const [a] = await sql`select dados from public.auditoria where empresa_id = ${e.empresaId}
      and acao = 'onboarding.modelo_trocado'`;
    expect(a!.dados).toMatchObject({
      antes: { segmento: 'infantil' },
      depois: { modelo: 'casamento' },
    });
    // nada do modelo infantil sobrou
    const [n] = await sql`select count(*)::int as n from public.pacotes
      where empresa_id = ${e.empresaId} and nome in ('Alegria', 'Super', 'Encanto')`;
    expect(n!.n).toBe(0);
  });

  it('depois de confirmar preço, não troca mais (nunca apaga o que o dono confirmou)', async () => {
    await confirmarPrecosDoModelo(sql, e.empresaId);
    expect(await podeTrocarModelo(dono)).toBe(false);
    await expect(comUsuario(e.donoId, (tx) => trocarModelo(tx, dono, 'infantil'))).rejects.toThrow(
      'MODELO_EM_USO',
    );
    const [n] = await sql`select count(*)::int as n from public.pacotes
      where empresa_id = ${e.empresaId} and preco_confirmado_em is not null`;
    expect(n!.n).toBe(3);
  });

  it('vendedor não troca', async () => {
    const vendedor = { ...(await lerUsuario(e.vendedorId))!, suporte: null } as UsuarioAtual;
    expect(await podeTrocarModelo(vendedor)).toBe(false);
  });
});
