import 'server-only';
import { cookies } from 'next/headers';
import { COOKIE_MENU, menuRecolhido } from '@/domain/tema';

/** Menu lateral recolhido? Lido no servidor: o painel já abre do jeito certo, sem piscar. */
export async function lerMenuRecolhido(): Promise<boolean> {
  return menuRecolhido((await cookies()).get(COOKIE_MENU)?.value);
}
