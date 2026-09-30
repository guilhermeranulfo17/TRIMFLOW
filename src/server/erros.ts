/**
 * Traduz erros técnicos (Supabase Auth, banco) para mensagens em português simples.
 * Nunca exponha a mensagem original ao usuário.
 */

type ErroComCodigo = { code?: string; status?: number; message?: string } | null | undefined;

export const MENSAGEM_GENERICA = 'Algo deu errado. Tente novamente em instantes.';

const POR_CODIGO: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  user_already_exists: 'Já existe uma conta com esse e-mail. Tente entrar.',
  email_exists: 'Já existe uma conta com esse e-mail. Tente entrar.',
  weak_password: 'Senha muito fraca. Use pelo menos 8 caracteres.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  email_not_confirmed:
    'Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada.',
  over_request_rate_limit: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  over_email_send_rate_limit: 'Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.',
  otp_expired: 'Esse link expirou. Peça um novo.',
  session_not_found: 'Sua sessão expirou. Entre novamente.',
  user_banned: 'Seu acesso foi desativado. Fale com o dono do buffet.',
  signup_disabled: 'Cadastro temporariamente indisponível.',
  unexpected_failure: 'Não foi possível concluir agora. Tente novamente em instantes.',
};

export function mensagemDeErroAuth(erro: ErroComCodigo): string {
  if (!erro) return MENSAGEM_GENERICA;
  if (erro.code && POR_CODIGO[erro.code]) return POR_CODIGO[erro.code]!;
  if (erro.status === 429) return POR_CODIGO.over_request_rate_limit!;
  // Falha do trigger de cadastro chega como "Database error saving new user".
  if (erro.message?.toLowerCase().includes('database error')) {
    return 'Não foi possível criar sua conta agora. Confira os dados e tente novamente.';
  }
  return MENSAGEM_GENERICA;
}
