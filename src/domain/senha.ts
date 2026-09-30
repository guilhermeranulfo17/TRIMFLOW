/**
 * Senha temporária legível para o primeiro acesso de um vendedor.
 * Sem caracteres ambíguos (0/O, 1/l/I). Sempre tem minúscula, maiúscula e dígito.
 * A aleatoriedade entra como parâmetro (no servidor: crypto.randomInt) para ser testável.
 */

const MINUSCULAS = 'abcdefghjkmnpqrstuvwxyz';
const MAIUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITOS = '23456789';
const TODOS = MINUSCULAS + MAIUSCULAS + DIGITOS;

export const TAMANHO_SENHA_TEMPORARIA = 12;

/** `aleatorio(max)` deve devolver um inteiro uniforme em [0, max). */
export function gerarSenhaTemporaria(aleatorio: (max: number) => number): string {
  const escolher = (alfabeto: string) => alfabeto[aleatorio(alfabeto.length)]!;
  const caracteres = [escolher(MINUSCULAS), escolher(MAIUSCULAS), escolher(DIGITOS)];
  while (caracteres.length < TAMANHO_SENHA_TEMPORARIA) caracteres.push(escolher(TODOS));
  // Embaralha (Fisher–Yates) para as classes obrigatórias não ficarem sempre no início.
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j]!, caracteres[i]!];
  }
  return caracteres.join('');
}

export function senhaTemporariaValida(senha: string): boolean {
  return (
    senha.length === TAMANHO_SENHA_TEMPORARIA &&
    [...senha].every((c) => TODOS.includes(c)) &&
    /[a-z]/.test(senha) &&
    /[A-Z]/.test(senha) &&
    /[2-9]/.test(senha)
  );
}
