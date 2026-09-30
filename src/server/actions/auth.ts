'use server';

import { sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { celularBRParaE164 } from '@/domain/phone';
import { slugBaseDaEmpresa } from '@/domain/slug';
import {
  loginSchema,
  novaSenhaSchema,
  recuperarSenhaSchema,
  type LoginInput,
  type NovaSenhaInput,
  type RecuperarSenhaInput,
} from '@/domain/validacao/auth';
import { cadastroSchema, type CadastroInput } from '@/domain/validacao/cadastro';
import { criarAuthAdmin } from '@/server/auth/admin-supabase';
import { destinoSeguro, precisaTrocarSenha } from '@/server/auth/redirecionamento';
import { criarClienteSupabase } from '@/server/auth/supabase-server';
import { auditoria } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { urlDoSite } from '@/server/env';
import { mensagemDeErroAuth } from '@/server/erros';

export type ResultadoAcao = { ok: true; mensagem?: string } | { ok: false; erro: string };

const DADOS_INVALIDOS: ResultadoAcao = { ok: false, erro: 'Confira os campos destacados.' };

async function origemDoSite(): Promise<string> {
  const configurada = urlDoSite();
  if (configurada) return configurada;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Cadastro do dono. O signup grava em auth.users e o trigger `criar_conta_dono` cria empresa,
 * usuário dono e auditoria na mesma transação (ver supabase/migrations/*_cadastro.sql).
 */
export async function cadastrar(input: CadastroInput): Promise<ResultadoAcao> {
  const parsed = cadastroSchema.safeParse(input);
  if (!parsed.success) return DADOS_INVALIDOS;
  const dados = parsed.data;
  const whatsappE164 = celularBRParaE164(dados.whatsapp);
  if (!whatsappE164) return { ok: false, erro: 'Informe um celular válido com DDD.' };

  const supabase = await criarClienteSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: dados.email,
    password: dados.senha,
    options: {
      emailRedirectTo: `${await origemDoSite()}/auth/confirm?next=/app/leads`,
      data: {
        nome: dados.nome,
        nome_buffet: dados.nomeBuffet,
        whatsapp_e164: whatsappE164,
        segmento: dados.segmento,
        slug_base: slugBaseDaEmpresa(dados.nomeBuffet),
      },
    },
  });
  if (error) return { ok: false, erro: mensagemDeErroAuth(error) };

  // Com confirmação de e-mail ligada no projeto, o signup não devolve sessão.
  if (!data.session) {
    return {
      ok: true,
      mensagem: 'Conta criada! Enviamos um link de confirmação para o seu e-mail.',
    };
  }
  redirect('/app/leads');
}

export async function entrar(input: LoginInput, next?: string | null): Promise<ResultadoAcao> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return DADOS_INVALIDOS;

  const supabase = await criarClienteSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  });
  if (error) return { ok: false, erro: mensagemDeErroAuth(error) };
  // Senha temporária (vendedor criado pelo dono): primeiro cria a senha pessoal.
  if (precisaTrocarSenha(data.user?.app_metadata)) redirect('/nova-senha');
  redirect(destinoSeguro(next));
}

export async function sair(): Promise<void> {
  const supabase = await criarClienteSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}

/** Sempre responde igual, exista ou não a conta (não revela e-mails cadastrados). */
export async function recuperarSenha(input: RecuperarSenhaInput): Promise<ResultadoAcao> {
  const parsed = recuperarSenhaSchema.safeParse(input);
  if (!parsed.success) return DADOS_INVALIDOS;

  const supabase = await criarClienteSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await origemDoSite()}/auth/confirm?next=/nova-senha`,
  });
  if (error && (error.status === 429 || error.code?.startsWith('over_'))) {
    return { ok: false, erro: mensagemDeErroAuth(error) };
  }
  return {
    ok: true,
    mensagem: 'Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha.',
  };
}

export async function definirNovaSenha(input: NovaSenhaInput): Promise<ResultadoAcao> {
  const parsed = novaSenhaSchema.safeParse(input);
  if (!parsed.success) return DADOS_INVALIDOS;

  const supabase = await criarClienteSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, erro: 'Seu link expirou. Peça um novo em "Esqueci minha senha".' };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.senha });
  if (error) return { ok: false, erro: mensagemDeErroAuth(error) };

  // Primeiro acesso do vendedor: a senha temporária deixa de valer como obrigação.
  if (precisaTrocarSenha(user.app_metadata)) {
    try {
      await criarAuthAdmin().concluirTrocaDeSenha(user.id);
    } catch (erro) {
      console.error('[auth] não foi possível concluir a troca de senha', erro);
      return {
        ok: false,
        erro: 'Senha alterada, mas não conseguimos liberar seu acesso. Tente de novo.',
      };
    }
  }

  await comUsuario(user.id, async (tx) => {
    const [linha] = await tx.execute<{ empresa_id: string | null }>(
      sql`select public.empresa_do_usuario() as empresa_id`,
    );
    if (!linha?.empresa_id) return;
    await tx.insert(auditoria).values({
      empresaId: linha.empresa_id,
      usuarioId: user.id,
      acao: 'usuario.senha_redefinida',
      entidade: 'usuario',
      entidadeId: user.id,
    });
  });

  redirect('/app/leads');
}
