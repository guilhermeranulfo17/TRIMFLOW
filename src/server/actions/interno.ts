'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { mensagemDeErroAuth } from '@/server/erros';
import { criarClienteSupabase } from '@/server/auth/supabase-server';
import { depsCobranca } from '@/server/cobranca/deps';
import { aplicarCupom, criarImplantacao, mudarPlano } from '@/server/cobranca/fluxos';
import { obterDb } from '@/server/db/client';
import { ehAdminOrkestra, exigirAdmin, type AdminAtual } from '@/server/interno/guard';
import {
  abrirSessaoSuporte,
  consentimentoAte,
  fecharSessaoSuporte,
} from '@/server/interno/suporte';
import { codigoDoErro, logar } from '@/server/log';

/*
 * Ações do /interno (equipe Orkestra). Toda ação exige admin com MFA e grava em
 * auditoria_interna (as funções interno_* gravam; as daqui chamam interno_registrar).
 */

export type ResultadoInterno =
  { ok: true; mensagem: string; url?: string | null } | { ok: false; erro: string };

const COBRANCA_DESLIGADA = 'O Asaas não está configurado neste servidor.';
const PADRAO = 'Não foi possível concluir agora.';
const uuid = z.string().uuid();

async function acaoInterna(
  fn: (admin: AdminAtual) => Promise<ResultadoInterno>,
  empresaId?: string,
): Promise<ResultadoInterno> {
  try {
    const admin = await exigirAdmin();
    if (empresaId !== undefined && !uuid.safeParse(empresaId).success) {
      return { ok: false, erro: 'Empresa não encontrada.' };
    }
    const r = await fn(admin);
    if (r.ok) revalidatePath('/interno', 'layout');
    return r;
  } catch (erro) {
    unstable_rethrow(erro);
    logar('erro', 'interno.acao', { codigo: codigoDoErro(erro) });
    return { ok: false, erro: PADRAO };
  }
}

// ---------------------------------------------------------------------------
// Entrar, MFA e sair
// ---------------------------------------------------------------------------

const loginSchema = z.object({ email: z.string().trim().email(), senha: z.string().min(1) });

/** Login do /interno. Fora da lista responde como senha errada (não revela quem é admin). */
export async function entrarInterno(entrada: {
  email: string;
  senha: string;
}): Promise<ResultadoInterno> {
  const v = loginSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: 'E-mail ou senha incorretos.' };
  if (!ehAdminOrkestra(v.data.email)) return { ok: false, erro: 'E-mail ou senha incorretos.' };
  const supabase = await criarClienteSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: v.data.email,
    password: v.data.senha,
  });
  if (error) return { ok: false, erro: mensagemDeErroAuth(error) };
  redirect('/interno/mfa');
}

/** Começa o cadastro do TOTP (apaga um cadastro anterior não confirmado). */
export async function iniciarCadastroMfa(): Promise<
  { ok: true; fatorId: string; qr: string; segredo: string } | { ok: false; erro: string }
> {
  const supabase = await criarClienteSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !ehAdminOrkestra(user.email)) return { ok: false, erro: 'Sessão expirada.' };
  const { data: fatores } = await supabase.auth.mfa.listFactors();
  for (const f of fatores?.all ?? []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Orkestra interno ${Date.now()}`,
  });
  if (error || !data) return { ok: false, erro: 'Não foi possível iniciar o cadastro do código.' };
  return { ok: true, fatorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret };
}

/** Confirma o código de 6 dígitos (cadastro ou entrada) e sobe a sessão para aal2. */
export async function confirmarMfa(entrada: {
  codigo: string;
  fatorId?: string | null;
}): Promise<ResultadoInterno> {
  const codigo = entrada.codigo.replace(/\D/g, '');
  if (codigo.length !== 6) return { ok: false, erro: 'Digite os 6 números do aplicativo.' };
  const supabase = await criarClienteSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !ehAdminOrkestra(user.email)) return { ok: false, erro: 'Sessão expirada.' };
  let fatorId = entrada.fatorId ?? null;
  if (!fatorId) {
    const { data } = await supabase.auth.mfa.listFactors();
    fatorId = data?.totp.find((f) => f.status === 'verified')?.id ?? null;
  }
  if (!fatorId) return { ok: false, erro: 'Cadastre o código primeiro.' };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: codigo });
  if (error) return { ok: false, erro: 'Código incorreto ou vencido. Tente o próximo.' };
  redirect('/interno');
}

export async function sairInterno(): Promise<void> {
  await fecharSessaoSuporte();
  const supabase = await criarClienteSupabase();
  await supabase.auth.signOut();
  redirect('/interno/entrar');
}

// ---------------------------------------------------------------------------
// Ações na empresa
// ---------------------------------------------------------------------------

const registrar = (admin: AdminAtual, acao: string, empresaId: string, dados: object = {}) =>
  obterDb().execute(
    sql`select public.interno_registrar(${admin.email}, ${acao}, ${empresaId}, ${JSON.stringify(dados)}::jsonb)`,
  );

export async function estenderTeste(empresaId: string, dias: number): Promise<ResultadoInterno> {
  return acaoInterna(async (admin) => {
    if (!Number.isInteger(dias) || dias < 1 || dias > 90)
      return { ok: false, erro: 'De 1 a 90 dias.' };
    await obterDb().execute(
      sql`select public.interno_estender_teste(${empresaId}, ${dias}, ${admin.email})`,
    );
    return { ok: true, mensagem: `Teste estendido em ${dias} dias.` };
  }, empresaId);
}

export async function suspenderEmpresa(
  empresaId: string,
  motivo: string,
): Promise<ResultadoInterno> {
  return acaoInterna(async (admin) => {
    await obterDb().execute(
      sql`select public.interno_suspender(${empresaId}, ${motivo.slice(0, 300)}, ${admin.email})`,
    );
    return { ok: true, mensagem: 'Empresa suspensa.' };
  }, empresaId);
}

export async function reativarEmpresa(empresaId: string): Promise<ResultadoInterno> {
  return acaoInterna(async (admin) => {
    await obterDb().execute(sql`select public.interno_reativar(${empresaId}, ${admin.email})`);
    return { ok: true, mensagem: 'Suspensão manual removida.' };
  }, empresaId);
}

export async function isentarEmpresa(
  empresaId: string,
  isenta: boolean,
): Promise<ResultadoInterno> {
  return acaoInterna(async (admin) => {
    await obterDb().execute(
      sql`select public.interno_isentar(${empresaId}, ${isenta}, ${admin.email})`,
    );
    return { ok: true, mensagem: isenta ? 'Conta marcada como cortesia.' : 'Cortesia removida.' };
  }, empresaId);
}

export async function aplicarCupomInterno(
  empresaId: string,
  codigo: string,
): Promise<ResultadoInterno> {
  return acaoInterna(async (admin) => {
    const deps = depsCobranca();
    if (!deps) return { ok: false, erro: COBRANCA_DESLIGADA };
    const r = await aplicarCupom(deps, { empresaId, codigo, admin: admin.email });
    if (!r.ok) return { ok: false, erro: r.erro };
    return { ok: true, mensagem: 'Cupom aplicado.' };
  }, empresaId);
}

export async function criarImplantacaoInterna(empresaId: string): Promise<ResultadoInterno> {
  return acaoInterna(async (admin) => {
    const deps = depsCobranca();
    if (!deps) return { ok: false, erro: COBRANCA_DESLIGADA };
    const r = await criarImplantacao(deps, { empresaId, admin: admin.email });
    return r.ok
      ? { ok: true, mensagem: 'Cobrança de implantação criada.', url: r.dados.urlFatura }
      : { ok: false, erro: r.erro };
  }, empresaId);
}

export async function mudarPlanoInterno(
  empresaId: string,
  plano: string,
  ciclo: string,
): Promise<ResultadoInterno> {
  return acaoInterna(async (admin) => {
    const p = z.enum(['essencial', 'profissional']).safeParse(plano);
    const c = z.enum(['mensal', 'anual']).safeParse(ciclo);
    if (!p.success || !c.success) return { ok: false, erro: 'Escolha plano e ciclo.' };
    const deps = depsCobranca();
    if (!deps) return { ok: false, erro: COBRANCA_DESLIGADA };
    const r = await mudarPlano(deps, {
      empresaId,
      usuarioId: null,
      plano: p.data,
      ciclo: c.data,
      admin: admin.email,
    });
    if (!r.ok) return { ok: false, erro: r.erro };
    await registrar(admin, 'plano.mudou', empresaId, { plano: p.data, ciclo: c.data });
    return { ok: true, mensagem: 'Plano alterado.' };
  }, empresaId);
}

// ---------------------------------------------------------------------------
// Acesso de suporte
// ---------------------------------------------------------------------------

/** "Entrar como esta empresa": só com o consentimento vigente do dono. */
export async function entrarComoEmpresa(empresaId: string): Promise<ResultadoInterno> {
  const r = await acaoInterna(async (admin) => {
    const ate = await consentimentoAte(empresaId);
    if (!ate) return { ok: false, erro: 'O dono não permitiu o acesso do suporte.' };
    const db = obterDb();
    const [dono] = await db.execute<{ id: string }>(
      sql`select id from public.usuarios where empresa_id = ${empresaId} and perfil = 'dono'
        and ativo order by criado_em limit 1`,
    );
    if (!dono) return { ok: false, erro: 'A empresa não tem dono ativo.' };
    await abrirSessaoSuporte(
      { empresaId, donoId: dono.id, adminId: admin.id, adminEmail: admin.email },
      ate,
    );
    await registrar(admin, 'suporte.entrou', empresaId);
    await db.execute(
      sql`insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
        values (${empresaId}, null, 'suporte.entrou', 'empresa', ${empresaId},
          ${JSON.stringify({ suporte: admin.email })}::jsonb)`,
    );
    return { ok: true, mensagem: 'Entrando…' };
  }, empresaId);
  if (r.ok) redirect('/app/leads');
  return r;
}

/** Sai do modo suporte e volta para a ficha da empresa no /interno. */
export async function sairDoSuporte(): Promise<void> {
  const s = await fecharSessaoSuporte();
  if (s) {
    await obterDb().execute(
      sql`select public.interno_registrar(${s.adminEmail}, 'suporte.saiu', ${s.empresaId}, '{}'::jsonb)`,
    );
  }
  redirect(s ? `/interno/empresas/${s.empresaId}` : '/interno');
}
