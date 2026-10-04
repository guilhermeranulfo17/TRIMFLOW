'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { destinoSeguro } from '@/server/auth/redirecionamento';
import { definirMarcaMfa } from '@/server/auth/admin-supabase';
import { exigirPerfil } from '@/server/auth/guards';
import { criarClienteSupabase } from '@/server/auth/supabase-server';
import { comUsuario } from '@/server/db/tenant';
import { auditoria } from '@/server/db/schema';
import { logar } from '@/server/log';

/*
 * Verificação em duas etapas (TOTP) para o dono (Etapa 9B, B.2). Opcional no painel; no /interno
 * é obrigatória (server/actions/interno). O Supabase Auth guarda o fator; aqui só orquestra.
 */

export type ResultadoMfa = { ok: true; mensagem?: string } | { ok: false; erro: string };
export type CadastroIniciado =
  { ok: true; fatorId: string; qr: string; segredo: string } | { ok: false; erro: string };

const so6 = (codigo: string) => codigo.replace(/\D/g, '');

async function registrar(usuarioId: string, empresaId: string, acao: string) {
  await comUsuario(usuarioId, (tx) =>
    tx.insert(auditoria).values({
      empresaId,
      usuarioId,
      acao,
      entidade: 'usuario',
      entidadeId: usuarioId,
    }),
  );
}

/** Começa o cadastro (apaga um cadastro anterior não confirmado). */
export async function iniciarMfaConta(): Promise<CadastroIniciado> {
  await exigirPerfil('dono');
  const supabase = await criarClienteSupabase();
  const { data: fatores } = await supabase.auth.mfa.listFactors();
  if (fatores?.totp.some((f) => f.status === 'verified')) {
    return { ok: false, erro: 'A verificação em duas etapas já está ligada.' };
  }
  for (const f of fatores?.all ?? []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Orkestra ${Date.now()}`,
    issuer: 'Orkestra',
  });
  if (error || !data) return { ok: false, erro: 'Não foi possível iniciar agora. Tente de novo.' };
  return { ok: true, fatorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret };
}

/** Confirma o primeiro código: o fator fica verificado e a sessão sobe para aal2. */
export async function confirmarMfaConta(entrada: {
  fatorId: string;
  codigo: string;
}): Promise<ResultadoMfa> {
  const dono = await exigirPerfil('dono');
  const codigo = so6(entrada.codigo);
  if (codigo.length !== 6) return { ok: false, erro: 'Digite os 6 números do aplicativo.' };
  const supabase = await criarClienteSupabase();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: entrada.fatorId,
    code: codigo,
  });
  if (error) return { ok: false, erro: 'Código incorreto ou vencido. Tente o próximo.' };
  await definirMarcaMfa(dono.id, true);
  await supabase.auth.refreshSession();
  await registrar(dono.id, dono.empresa.id, 'usuario.mfa_ligada');
  revalidatePath('/app/conta/seguranca');
  return { ok: true, mensagem: 'Verificação em duas etapas ligada.' };
}

/** Desliga (pede um código atual: quem só tem a senha não consegue desligar). */
export async function desativarMfaConta(codigoInformado: string): Promise<ResultadoMfa> {
  const dono = await exigirPerfil('dono');
  const codigo = so6(codigoInformado);
  if (codigo.length !== 6) return { ok: false, erro: 'Digite os 6 números do aplicativo.' };
  const supabase = await criarClienteSupabase();
  const { data } = await supabase.auth.mfa.listFactors();
  const fator = data?.totp.find((f) => f.status === 'verified');
  if (!fator) return { ok: false, erro: 'A verificação em duas etapas já está desligada.' };
  const verificado = await supabase.auth.mfa.challengeAndVerify({
    factorId: fator.id,
    code: codigo,
  });
  if (verificado.error) return { ok: false, erro: 'Código incorreto ou vencido. Tente o próximo.' };
  const { error } = await supabase.auth.mfa.unenroll({ factorId: fator.id });
  if (error) {
    logar('erro', 'mfa.desligar', { codigo: error.code ?? 'sem-codigo' });
    return { ok: false, erro: 'Não foi possível desligar agora. Tente de novo.' };
  }
  await definirMarcaMfa(dono.id, false);
  await supabase.auth.refreshSession();
  await registrar(dono.id, dono.empresa.id, 'usuario.mfa_desligada');
  revalidatePath('/app/conta/seguranca');
  return { ok: true, mensagem: 'Verificação em duas etapas desligada.' };
}

/** Segundo passo do login (e-mail ou Google) de quem tem a verificação ligada. */
export async function verificarCodigoLogin(entrada: {
  codigo: string;
  next?: string | null;
}): Promise<ResultadoMfa> {
  const codigo = so6(entrada.codigo);
  if (codigo.length !== 6) return { ok: false, erro: 'Digite os 6 números do aplicativo.' };
  const supabase = await criarClienteSupabase();
  const { data } = await supabase.auth.mfa.listFactors();
  const fator = data?.totp.find((f) => f.status === 'verified');
  if (!fator) redirect(destinoSeguro(entrada.next));
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: fator.id,
    code: codigo,
  });
  if (error) return { ok: false, erro: 'Código incorreto ou vencido. Tente o próximo.' };
  redirect(destinoSeguro(entrada.next));
}
