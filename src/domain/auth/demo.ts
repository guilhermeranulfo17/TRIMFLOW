/*
 * Conta de demonstração (Etapa 9B, B.5): sessão de 2 horas, sem senha, somente leitura.
 */

/** Cookie com o fim da sessão de demonstração (epoch em ms). */
export const COOKIE_DEMO = 'orkestra_demo';
export const DURACAO_DEMO_MS = 2 * 60 * 60 * 1000;

export const MENSAGEM_DEMO = 'Esta é uma demonstração. Crie sua conta grátis para usar de verdade.';

/** Caminho que sai da demo e abre o cadastro (encerra a sessão do visitante antes). */
export const SAIR_DA_DEMO_PARA_CADASTRO = '/auth/sair?para=cadastro';

/** A sessão é do usuário da demo? (marca app_metadata.demo, gravada só pela Admin API) */
export function ehSessaoDemo(appMetadata: Record<string, unknown> | null | undefined): boolean {
  return appMetadata?.demo === true;
}

/** Valor do cookie: fim da sessão. */
export function fimDaDemo(agora: number): string {
  return String(agora + DURACAO_DEMO_MS);
}

/** Sessão da demo vencida: sem cookie, cookie inválido ou passado das 2 horas. */
export function demoVencida(valor: string | null | undefined, agora: number): boolean {
  if (!valor || !/^\d{13}$/.test(valor)) return true;
  const fim = Number(valor);
  return fim <= agora || fim > agora + DURACAO_DEMO_MS;
}

/** A mensagem é a da demo (o toast mostra o botão "Criar conta grátis"). */
export const ehMensagemDemo = (mensagem: string): boolean => mensagem === MENSAGEM_DEMO;
