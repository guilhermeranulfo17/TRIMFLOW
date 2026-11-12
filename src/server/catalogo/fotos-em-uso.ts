import 'server-only';
import { sql } from 'drizzle-orm';
import { urlPublicaMidia } from '@/lib/midia';
import type { Tx } from '@/server/db/tenant';

/**
 * Das fotos que iam ser apagadas do Storage, as que ainda estão em uso e devem ficar: as de
 * pacotes, opcionais e seções do cardápio da empresa (duplicar compartilha os arquivos) e as
 * congeladas em alguma versão de proposta (o PDF de uma versão emitida mostra sempre a mesma
 * foto). Chamar DEPOIS de gravar a mudança, na mesma transação (o RLS limita à empresa).
 */
export async function fotosAindaEmUso(tx: Tx, candidatas: string[]): Promise<Set<string>> {
  const unicas = [...new Set(candidatas)];
  if (unicas.length === 0) return new Set();
  const pares = unicas.map((caminho) => ({ caminho, url: urlPublicaMidia(caminho) ?? caminho }));
  const linhas = await tx.execute<{ caminho: string }>(sql`
    select c.caminho
    from jsonb_to_recordset(${JSON.stringify(pares)}::jsonb) as c(caminho text, url text)
    where exists (select 1 from public.pacotes p where p.fotos @> jsonb_build_array(c.caminho))
       or exists (select 1 from public.opcionais o where o.fotos @> jsonb_build_array(c.caminho))
       or exists (select 1 from public.secoes_cardapio s where s.foto_url = c.caminho)
       or exists (
         select 1 from public.orcamentos o
         where o.conteudo is not null and position(c.url in o.conteudo::text) > 0
       )`);
  return new Set(linhas.map((l) => l.caminho));
}
