'use server';

import { sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { ehSessaoDemo, MENSAGEM_DEMO } from '@/domain/auth/demo';
import { VERSAO_DOCUMENTOS } from '@/domain/legal/versao';
import { COOKIE_ORIGEM, lerOrigemDoCookie } from '@/domain/marketing/origem';
import { modeloDoSegmento } from '@/domain/modelos';
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
import {
  cadastroSchema,
  completarSchema,
  type CadastroInput,
  type CompletarInput,
} from '@/domain/validacao/cadastro';
import { criarAuthAdmin } from '@/server/auth/admin-supabase';
import { processarAvisosSemFalhar } from '@/server/avisos/processar';
import { destinoSeguro, precisaTrocarSenha } from '@/server/auth/redirecionamento';
import { criarClienteSupabase } from '@/server/auth/supabase-server';
import { gravarModelo } from '@/server/catalogo/gravar-modelo';
import { auditoria } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { siteUrl } from '@/server/env';
import { mensagemDeErroAuth } from '@/server/erros';
import { codigoDoErro, logar } from '@/server/log';
import { dentroDoLimite, MENSAGEM_LIMITE } from '@/server/seguranca/limite';

export type ResultadoAcao = { ok: true; mensagem?: string } | { ok: false; erro: string };

const DADOS_INVALIDOS: ResultadoAcao = { ok: false, erro: 'Confira os campos destacados.' };

/** Links do Auth (confirmação, nova senha) sempre no domínio configurado, nunca no do Host. */
async function origemDoSite(): Promise<string> {
  return siteUrl();
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
  if (!(await dentroDoLimite('cadastro'))) return { ok: false, erro: MENSAGEM_LIMITE };

  const supabase = await criarClienteSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: dados.email,
    password: dados.senha,
    options: {
      emailRedirectTo: `${await origemDoSite()}/auth/confirm?next=/app/comecar`,
      data: {
        nome: dados.nome,
        nome_buffet: dados.nomeBuffet,
        whatsapp_e164: whatsappE164,
        segmento: dados.segmento,
        slug_base: slugBaseDaEmpresa(dados.nomeBuffet),
        termos_aceitos_em: new Date().toISOString(),
      },
    },
  });
  if (error) return { ok: false, erro: mensagemDeErroAuth(error) };
  // aceite dos Termos e da Privacidade (versão e data), mesmo sem sessão (confirmação por e-mail)
  if (data.user) {
    await registrarAceite(data.user.id);
    await avisarBoasVindas(data.user.id);
  }

  // Com confirmação de e-mail ligada no projeto, o signup não devolve sessão.
  if (!data.session) {
    return {
      ok: true,
      mensagem: 'Conta criada! Enviamos um link de confirmação para o seu e-mail.',
    };
  }
  if (data.user) {
    await aplicarModeloDoCadastro(data.user.id, dados.segmento);
    await registrarOrigem(data.user.id);
  }
  redirect('/app/comecar');
}

/**
 * Quem entrou pelo Google e ainda não tem conta no Orkestra completa os dados do buffet
 * (completar_conta_dono: só o próprio usuário, idempotente). Depois, igual ao cadastro: modelo do
 * segmento e onboarding.
 */
export async function completarConta(input: CompletarInput): Promise<ResultadoAcao> {
  const parsed = completarSchema.safeParse(input);
  if (!parsed.success) return DADOS_INVALIDOS;
  const dados = parsed.data;
  const whatsappE164 = celularBRParaE164(dados.whatsapp);
  if (!whatsappE164) return { ok: false, erro: 'Informe um celular válido com DDD.' };

  const supabase = await criarClienteSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, erro: 'Sua sessão expirou. Entre de novo com o Google.' };

  try {
    await comUsuario(user.id, (tx) =>
      tx.execute(sql`select public.completar_conta_dono(
        ${dados.nome}, ${dados.nomeBuffet}, ${whatsappE164},
        ${dados.segmento}::public.segmento_empresa, ${slugBaseDaEmpresa(dados.nomeBuffet)})`),
    );
  } catch {
    logar('erro', 'cadastro.completar_falhou');
    return { ok: false, erro: 'Não foi possível criar sua conta agora. Tente novamente.' };
  }
  await registrarAceite(user.id);
  await avisarBoasVindas(user.id);
  await aplicarModeloDoCadastro(user.id, dados.segmento);
  await registrarOrigem(user.id);
  redirect('/app/comecar');
}

/**
 * Aceite versionado (Etapa 9B, LGPD): o checkbox do cadastro vira versão e data gravadas. Se
 * falhar, o cadastro segue e o painel pede o aceite no primeiro acesso (/app/aceite).
 */
async function registrarAceite(usuarioId: string) {
  try {
    await comUsuario(usuarioId, (tx) =>
      tx.execute(sql`select public.registrar_aceite(${VERSAO_DOCUMENTOS})`),
    );
  } catch (e) {
    logar('aviso', 'cadastro.aceite_nao_registrado', {
      codigo: (e as { code?: string }).code ?? 'sem-codigo',
    });
  }
}

/**
 * Boas-vindas (Etapa 9B, B.4): aviso no painel e e-mail com o link do buffet. Uma vez por empresa;
 * falhar aqui nunca impede o cadastro.
 */
async function avisarBoasVindas(usuarioId: string) {
  try {
    await comUsuario(usuarioId, (tx) => tx.execute(sql`select public.avisar_boas_vindas()`));
    after(processarAvisosSemFalhar);
  } catch (e) {
    logar('aviso', 'cadastro.boas_vindas_falhou', { codigo: codigoDoErro(e) });
  }
}

/**
 * Origem do cadastro (Etapa 9.6): utm_ e ref guardados pela landing no cookie, gravados uma vez
 * na empresa. Falhar aqui nunca impede o cadastro (o log leva só o código do erro).
 */
async function registrarOrigem(usuarioId: string) {
  try {
    const loja = await cookies();
    const origem = lerOrigemDoCookie(loja.get(COOKIE_ORIGEM)?.value);
    if (!origem) return;
    await comUsuario(usuarioId, (tx) =>
      tx.execute(sql`select public.registrar_origem_cadastro(${JSON.stringify(origem)}::jsonb)`),
    );
    loja.delete(COOKIE_ORIGEM);
  } catch (e) {
    logar('aviso', 'cadastro.origem_nao_registrada', { codigo: codigoDoErro(e) });
  }
}

/**
 * A conta nasce com o catálogo do modelo do segmento (preços de exemplo, NÃO confirmados: fora
 * do link até o dono confirmar no passo 3). Idempotente (gravarModelo nunca sobrescreve e tem
 * trava por empresa). Se falhar, o cadastro segue: o passo 1 oferece carregar o modelo.
 */
async function aplicarModeloDoCadastro(usuarioId: string, segmento: CadastroInput['segmento']) {
  try {
    const [linha] = (await comUsuario(usuarioId, (tx) =>
      tx.execute(sql`select empresa_id from public.usuarios where id = ${usuarioId}`),
    )) as unknown as { empresa_id: string }[];
    if (!linha) return;
    await gravarModelo(comUsuario, usuarioId, linha.empresa_id, modeloDoSegmento(segmento));
  } catch {
    logar('erro', 'cadastro.modelo_nao_aplicado');
  }
}

export async function entrar(input: LoginInput, next?: string | null): Promise<ResultadoAcao> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return DADOS_INVALIDOS;
  if (!(await dentroDoLimite('login', { email: parsed.data.email }))) {
    return { ok: false, erro: MENSAGEM_LIMITE };
  }

  const supabase = await criarClienteSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  });
  if (error) return { ok: false, erro: mensagemDeErroAuth(error) };
  // Senha temporária (vendedor criado pelo dono): primeiro cria a senha pessoal.
  if (precisaTrocarSenha(data.user?.app_metadata)) redirect('/nova-senha');
  // Verificação em duas etapas ligada: falta o código do aplicativo (Etapa 9B)
  if (data.user?.app_metadata?.mfa === true) {
    redirect(`/login/verificacao?next=${encodeURIComponent(destinoSeguro(next))}`);
  }
  redirect(destinoSeguro(next));
}

export async function sair(): Promise<void> {
  const supabase = await criarClienteSupabase();
  // demo: um usuário para todos os visitantes, então só esta sessão sai
  const { data } = await supabase.auth.getClaims();
  const demo = ehSessaoDemo(data?.claims?.app_metadata as Record<string, unknown> | undefined);
  await supabase.auth.signOut({ scope: demo ? 'local' : 'global' });
  redirect('/login');
}

/** Sempre responde igual, exista ou não a conta (não revela e-mails cadastrados). */
export async function recuperarSenha(input: RecuperarSenhaInput): Promise<ResultadoAcao> {
  const parsed = recuperarSenhaSchema.safeParse(input);
  if (!parsed.success) return DADOS_INVALIDOS;
  if (!(await dentroDoLimite('recuperar_senha', { email: parsed.data.email }))) {
    return { ok: false, erro: MENSAGEM_LIMITE };
  }

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
  if (ehSessaoDemo(user.app_metadata)) return { ok: false, erro: MENSAGEM_DEMO };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.senha });
  if (error) return { ok: false, erro: mensagemDeErroAuth(error) };

  // Primeiro acesso do vendedor: a senha temporária deixa de valer como obrigação.
  if (precisaTrocarSenha(user.app_metadata)) {
    try {
      await criarAuthAdmin().concluirTrocaDeSenha(user.id);
    } catch (erro) {
      logar('erro', 'auth.troca_de_senha', { codigo: codigoDoErro(erro) });
      return {
        ok: false,
        erro: 'Senha alterada, mas não conseguimos liberar seu acesso. Tente de novo.',
      };
    }
    // A sessão é lida pelos claims do JWT (getClaims): renova o token para ele já sair sem o
    // trocar_senha; senão o middleware manda de volta para /nova-senha até o token expirar.
    await supabase.auth.refreshSession();
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
