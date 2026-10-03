/*
 * Força da senha no cadastro (só orientação na tela; o mínimo que vale é o do schema: 8
 * caracteres). Pontos por tamanho e variedade; sequências e repetições óbvias derrubam.
 */

export type NivelSenha = 'fraca' | 'media' | 'forte';

const OBVIAS = ['123456', 'abcdef', 'qwerty', 'senha', 'password', '000000', '111111'];

export function forcaDaSenha(senha: string): { nivel: NivelSenha; pontos: number } {
  if (senha.length < 8) return { nivel: 'fraca', pontos: 0 };
  let pontos = 0;
  if (senha.length >= 10) pontos++;
  if (senha.length >= 14) pontos++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(senha)).length;
  pontos += classes - 1;
  const minuscula = senha.toLowerCase();
  if (OBVIAS.some((o) => minuscula.includes(o)) || /(.)\1{3,}/.test(senha)) pontos -= 2;
  pontos = Math.max(0, pontos);
  return { nivel: pontos >= 4 ? 'forte' : pontos >= 2 ? 'media' : 'fraca', pontos };
}

export const ROTULO_FORCA: Record<NivelSenha, string> = {
  fraca: 'Fraca',
  media: 'Média',
  forte: 'Forte',
};
