import 'server-only';
import { criarClienteSupabase } from '@/server/auth/supabase-server';
import { logar } from '@/server/log';

/**
 * Apaga arquivos do bucket "midia" com a sessão do dono (as policies do bucket valem).
 * Falha ao apagar não desfaz a gravação: o arquivo fica solto e é só registrado no log.
 */
export async function apagarArquivosMidia(caminhos: (string | null | undefined)[]) {
  const lista = caminhos.filter((c): c is string => !!c);
  if (lista.length === 0) return;
  const supabase = await criarClienteSupabase();
  const { error } = await supabase.storage.from('midia').remove(lista);
  if (error) logar('erro', 'storage.apagar', { arquivos: lista.length });
}
