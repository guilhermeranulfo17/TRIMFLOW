import 'server-only';
import { cookies } from 'next/headers';
import { COOKIE_TEMA, temaValido, type Tema } from '@/domain/tema';

/** Tema escolhido (cookie), lido no servidor: o HTML já sai com o tema certo, sem piscar. */
export async function lerTema(): Promise<Tema> {
  return temaValido((await cookies()).get(COOKIE_TEMA)?.value);
}
