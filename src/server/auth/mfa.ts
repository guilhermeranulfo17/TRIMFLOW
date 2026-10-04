import 'server-only';
import { definirMarcaMfa } from './admin-supabase';
import { criarClienteSupabase } from './supabase-server';

/** A marca diz que a verificação está ligada, mas não há fator verificado: corrige a marca. */
export async function corrigirMarcaMfa(usuarioId: string): Promise<void> {
  await definirMarcaMfa(usuarioId, false);
  const supabase = await criarClienteSupabase();
  await supabase.auth.refreshSession();
}

export { definirMarcaMfa };
