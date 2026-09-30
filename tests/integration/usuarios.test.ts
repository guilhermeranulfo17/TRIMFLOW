import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { senhaTemporariaValida } from '@/domain/senha';
import type { AuthAdmin } from '@/server/auth/admin-supabase';
import { criarDb } from '@/server/db/client';
import { criarComUsuario } from '@/server/db/tenant';
import {
  alterarAtivo,
  alterarLimiteDesconto,
  criarVendedor,
  type DepsUsuarios,
} from '@/server/usuarios/gerenciar';
import { conectar, urlBancoTeste } from '../support/db';
import {
  criarEmpresaTemporaria,
  removerEmpresa,
  type EmpresaTemporaria,
} from '../support/empresa-temporaria';

const sql = conectar();
const { db, sql: sqlDrizzle } = criarDb(urlBancoTeste(), { max: 4 });
const comUsuario = criarComUsuario(db);
const temporarias: EmpresaTemporaria[] = [];
const criadosNoAuth: string[] = [];

/** Admin API falsa: grava direto em auth.users (shim) e registra as chamadas. */
function authFalso(opcoes: { falharBanir?: boolean } = {}) {
  const chamadas: string[] = [];
  const auth: AuthAdmin = {
    async criarUsuario({ email, nome }) {
      const [existe] = await sql`select 1 from auth.users where email = ${email}`;
      if (existe) return { ok: false, motivo: 'email_em_uso' };
      const id = randomUUID();
      await sql`insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role)
        values (${id}, ${email}, ${sql.json({ nome })}, ${sql.json({ trocar_senha: true })},
                'authenticated', 'authenticated')`;
      criadosNoAuth.push(id);
      chamadas.push(`criar:${email}`);
      return { ok: true, id };
    },
    async apagarUsuario(id) {
      await sql`delete from auth.users where id = ${id}`;
      chamadas.push(`apagar:${id}`);
    },
    async banir(id) {
      if (opcoes.falharBanir) throw new Error('auth fora do ar');
      chamadas.push(`banir:${id}`);
    },
    async desbanir(id) {
      chamadas.push(`desbanir:${id}`);
    },
    async concluirTrocaDeSenha(id) {
      chamadas.push(`concluir:${id}`);
    },
  };
  return { auth, chamadas };
}

function deps(auth: AuthAdmin): DepsUsuarios {
  return { db, comUsuario, auth };
}

async function nova() {
  const e = await criarEmpresaTemporaria(sql, 'infantil');
  temporarias.push(e);
  return e;
}

const dono = (e: EmpresaTemporaria) => ({ id: e.donoId, empresa: { id: e.empresaId } });

const dadosVendedor = (email = `novo-${randomUUID().slice(0, 8)}@temp.test`) => ({
  nome: 'Carla Vendas',
  email,
  whatsapp: '(34) 99135-5450',
  limiteDescontoBp: 1250,
});

afterEach(async () => {
  while (temporarias.length > 0) await removerEmpresa(sql, temporarias.pop()!);
  if (criadosNoAuth.length) await sql`delete from auth.users where id in ${sql(criadosNoAuth)}`;
  criadosNoAuth.length = 0;
});
afterAll(async () => {
  await sql.end();
  await sqlDrizzle.end();
});

describe('criar vendedor', () => {
  it('cria no Auth e em usuarios, com senha temporária e auditoria, sem criar empresa', async () => {
    const e = await nova();
    const { auth } = authFalso();
    const [antes] = await sql`select count(*)::int as n from public.empresas`;
    const r = await criarVendedor(deps(auth), dono(e), dadosVendedor('carla@temp.test'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(senhaTemporariaValida(r.senha)).toBe(true);

    const [u] = await sql`select * from public.usuarios where id = ${r.id}`;
    expect(u).toMatchObject({
      empresa_id: e.empresaId,
      perfil: 'vendedor',
      email: 'carla@temp.test',
      whatsapp_e164: '+5534991355450',
      limite_desconto_pct: '12.50',
      ativo: true,
    });
    const [depois] = await sql`select count(*)::int as n from public.empresas`;
    expect(depois!.n).toBe(antes!.n);
    const [aud] = await sql`select * from public.auditoria
      where entidade_id = ${r.id} and acao = 'usuario.criado'`;
    expect(aud).toMatchObject({ empresa_id: e.empresaId, usuario_id: e.donoId });
    expect(JSON.stringify(aud!.dados)).not.toContain(r.senha);
  });

  it('e-mail já usado não cria nada', async () => {
    const e = await nova();
    const { auth } = authFalso();
    const r = await criarVendedor(deps(auth), dono(e), dadosVendedor(`dono-x@temp.test`));
    expect(r.ok).toBe(true);
    const r2 = await criarVendedor(deps(auth), dono(e), dadosVendedor(`dono-x@temp.test`));
    expect(r2).toEqual({ ok: false, motivo: 'email_em_uso' });
  });

  it('falha ao gravar em usuarios desfaz o usuário do Auth', async () => {
    const e = await nova();
    const { auth, chamadas } = authFalso();
    // Empresa inexistente: a FK de usuarios falha depois de o Auth já ter criado o usuário.
    const r = await criarVendedor(
      deps(auth),
      { id: e.donoId, empresa: { id: randomUUID() } },
      dadosVendedor('rollback@temp.test'),
    );
    expect(r).toEqual({ ok: false, motivo: 'falha' });
    expect(chamadas.some((c) => c.startsWith('apagar:'))).toBe(true);
    const restante = await sql`select 1 from auth.users where email = 'rollback@temp.test'`;
    expect(restante).toHaveLength(0);
    const semLinha = await sql`select 1 from public.usuarios where email = 'rollback@temp.test'`;
    expect(semLinha).toHaveLength(0);
  });
});

describe('desativar, reativar e limite', () => {
  it('dono desativa e reativa o vendedor (banco + Auth) com auditoria', async () => {
    const e = await nova();
    const { auth, chamadas } = authFalso();
    expect(await alterarAtivo(deps(auth), dono(e), e.vendedorId, false)).toBe('ok');
    let [u] = await sql`select ativo from public.usuarios where id = ${e.vendedorId}`;
    expect(u!.ativo).toBe(false);
    expect(await alterarAtivo(deps(auth), dono(e), e.vendedorId, true)).toBe('ok');
    [u] = await sql`select ativo from public.usuarios where id = ${e.vendedorId}`;
    expect(u!.ativo).toBe(true);
    expect(chamadas).toEqual([`banir:${e.vendedorId}`, `desbanir:${e.vendedorId}`]);
    const auds = await sql`select acao from public.auditoria where entidade_id = ${e.vendedorId}
      order by criado_em`;
    expect(auds.map((a) => a.acao)).toEqual(['usuario.desativado', 'usuario.reativado']);
  });

  it('dono não desativa a si mesmo', async () => {
    const e = await nova();
    const { auth, chamadas } = authFalso();
    expect(await alterarAtivo(deps(auth), dono(e), e.donoId, false)).toBe('proprio_usuario');
    expect(chamadas).toHaveLength(0);
  });

  it('se o bloqueio no Auth falhar, o usuário continua ativo', async () => {
    const e = await nova();
    const { auth } = authFalso({ falharBanir: true });
    await expect(alterarAtivo(deps(auth), dono(e), e.vendedorId, false)).rejects.toThrow();
    const [u] = await sql`select ativo from public.usuarios where id = ${e.vendedorId}`;
    expect(u!.ativo).toBe(true);
  });

  it('não altera usuário de outra empresa', async () => {
    const a = await nova();
    const b = await nova();
    const { auth, chamadas } = authFalso();
    expect(await alterarAtivo(deps(auth), dono(a), b.vendedorId, false)).toBe('nao_encontrado');
    expect(await alterarLimiteDesconto(deps(auth), dono(a), b.vendedorId, 500)).toBe(
      'nao_encontrado',
    );
    expect(chamadas).toHaveLength(0);
  });

  it('vendedor não consegue alterar usuários (RLS)', async () => {
    const e = await nova();
    const { auth } = authFalso();
    const comoVendedor = { id: e.vendedorId, empresa: { id: e.empresaId } };
    await expect(alterarLimiteDesconto(deps(auth), comoVendedor, e.vendedorId, 9000)).resolves.toBe(
      'nao_encontrado',
    );
    await expect(alterarAtivo(deps(auth), comoVendedor, e.donoId, false)).resolves.toBe(
      'nao_encontrado',
    );
    // O update não passa pela policy (só o dono altera): o valor continua o mesmo.
    const [u] =
      await sql`select limite_desconto_pct from public.usuarios where id = ${e.vendedorId}`;
    expect(u!.limite_desconto_pct).toBe('0.00');
  });

  it('dono altera o limite de desconto (bp → percentual)', async () => {
    const e = await nova();
    const { auth } = authFalso();
    expect(await alterarLimiteDesconto(deps(auth), dono(e), e.vendedorId, 750)).toBe('ok');
    const [u] =
      await sql`select limite_desconto_pct from public.usuarios where id = ${e.vendedorId}`;
    expect(u!.limite_desconto_pct).toBe('7.50');
  });
});
