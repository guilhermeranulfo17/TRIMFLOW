/** Botão "Continuar com o Google" só aparece com NEXT_PUBLIC_LOGIN_GOOGLE=1 (docs/LOGIN_GOOGLE.md). */
export function loginGoogleLigado(): boolean {
  return process.env.NEXT_PUBLIC_LOGIN_GOOGLE === '1';
}
