'use server';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { toE164 } from '@/domain/phone';
import {
  caminhoImagemValido,
  identidadeSchema,
  slugSchema,
  type IdentidadeEntrada,
  type SlugEntrada,
} from '@/domain/validacao/empresa';
import { apagarArquivosMidia } from '@/server/catalogo/midia';
import { empresas } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { acaoDoDono, auditar, diferencas, validar, type ResultadoAcao } from './comum';

export async function salvarIdentidade(entrada: IdentidadeEntrada): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(identidadeSchema, entrada);
    if (!v.ok) return v.resultado;
    const d = v.dados;
    const novos = {
      nome: d.nome,
      whatsappE164: toE164(d.whatsappE164, 'BR'),
      email: d.email || null,
      cidade: d.cidade || null,
      uf: d.uf || null,
      fuso: d.fuso,
      corMarca: d.corMarca.toUpperCase(),
      sobre: d.sobre || null,
    };
    await comUsuario(dono.id, async (tx) => {
      const [antes] = await tx
        .select({
          nome: empresas.nome,
          whatsappE164: empresas.whatsappE164,
          email: empresas.email,
          cidade: empresas.cidade,
          uf: empresas.uf,
          fuso: empresas.fuso,
          corMarca: empresas.corMarca,
          sobre: empresas.sobre,
        })
        .from(empresas)
        .where(eq(empresas.id, dono.empresa.id));
      await tx.update(empresas).set(novos).where(eq(empresas.id, dono.empresa.id));
      await auditar(
        tx,
        dono,
        'empresa.identidade_alterada',
        'empresa',
        dono.empresa.id,
        diferencas(antes ?? {}, novos),
      );
    });
    revalidatePath('/app', 'layout');
    return { ok: true, mensagem: 'Identidade salva.' };
  });
}

export async function alterarSlug(entrada: SlugEntrada): Promise<ResultadoAcao<{ slug: string }>> {
  return acaoDoDono<{ slug: string }>(async (dono) => {
    const v = validar(slugSchema, entrada);
    if (!v.ok) return v.resultado;
    try {
      const [linha] = await comUsuario(dono.id, (tx) =>
        tx.execute<{ slug: string }>(sql`select public.alterar_slug(${v.dados.slug}) as slug`),
      );
      revalidatePath('/app/empresa');
      return {
        ok: true,
        mensagem: 'Link alterado. O link antigo continua funcionando por 12 meses.',
        dados: { slug: linha!.slug },
      };
    } catch (erro) {
      const codigo =
        (erro as { code?: string; cause?: { code?: string } }).code ??
        (erro as { cause?: { code?: string } }).cause?.code;
      if (codigo === '23505') {
        return {
          ok: false,
          erro: 'Esse link já está em uso por outro buffet.',
          campos: { slug: 'Esse link já está em uso por outro buffet.' },
        };
      }
      if (codigo === '22023') {
        return {
          ok: false,
          erro: 'Link inválido.',
          campos: { slug: 'Use de 3 a 60 letras minúsculas, números e hífens.' },
        };
      }
      throw erro;
    }
  });
}

type TipoImagemEmpresa = 'logo' | 'capa';

export async function salvarImagemEmpresa(entrada: {
  tipo: TipoImagemEmpresa;
  caminho: string | null;
}): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const { tipo, caminho } = entrada;
    if (tipo !== 'logo' && tipo !== 'capa') return { ok: false, erro: 'Imagem inválida.' };
    if (caminho !== null && !caminhoImagemValido(caminho, dono.empresa.id, tipo)) {
      return { ok: false, erro: 'Imagem inválida.' };
    }
    const coluna = tipo === 'logo' ? empresas.logoPath : empresas.capaPath;
    const anterior = await comUsuario(dono.id, async (tx) => {
      const [linha] = await tx
        .select({ caminho: coluna })
        .from(empresas)
        .where(eq(empresas.id, dono.empresa.id));
      await tx
        .update(empresas)
        .set(tipo === 'logo' ? { logoPath: caminho } : { capaPath: caminho })
        .where(eq(empresas.id, dono.empresa.id));
      await auditar(
        tx,
        dono,
        `empresa.${tipo}_${caminho ? 'alterada' : 'removida'}`,
        'empresa',
        dono.empresa.id,
        {
          antes: linha?.caminho ?? null,
          depois: caminho,
        },
      );
      return linha?.caminho ?? null;
    });
    if (anterior && anterior !== caminho) await apagarArquivosMidia([anterior]);
    revalidatePath('/app/empresa');
    const nome = tipo === 'logo' ? 'Logo' : 'Capa';
    return { ok: true, mensagem: caminho ? `${nome} atualizada.` : `${nome} removida.` };
  });
}
