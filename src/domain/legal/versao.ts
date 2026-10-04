/*
 * Versão vigente dos Termos de Uso e da Política de Privacidade (Etapa 9B, B.1). Os dois textos
 * andam juntos: mudou um, suba a versão (data da publicação, `yyyy-MM-dd` ou `yyyy-MM-dd.N`). No
 * próximo acesso o dono aceita de novo (o painel redireciona para /app/aceite).
 */
export const VERSAO_DOCUMENTOS = '2026-10-04';

/** Data da versão para mostrar nas páginas ("4/10/2026"). */
export function dataDaVersao(versao = VERSAO_DOCUMENTOS): string {
  const [a, m, d] = versao.slice(0, 10).split('-');
  return `${Number(d)}/${Number(m)}/${a}`;
}

/** O dono precisa aceitar a versão vigente? (vendedor não: quem contrata é o dono) */
export function precisaAceitarTermos(
  perfil: 'dono' | 'vendedor',
  versaoAceita: string | null | undefined,
): boolean {
  return perfil === 'dono' && versaoAceita !== VERSAO_DOCUMENTOS;
}
