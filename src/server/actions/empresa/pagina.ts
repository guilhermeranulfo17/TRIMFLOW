'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  depoimentosSchema,
  galeriaSchema,
  perguntasSchema,
  textosPaginaSchema,
  type DepoimentosEntrada,
  type FotoGaleriaEntrada,
  type PerguntasEntrada,
  type TextosPaginaEntrada,
} from '@/domain/validacao/pagina';
import { apagarArquivosMidia } from '@/server/catalogo/midia';
import { comUsuario } from '@/server/db/tenant';
import { acaoDoDono, validar, type ResultadoAcao } from './comum';

/*
 * Editor da página pública (Minha empresa → Link). Grava só pelas funções salvar_* (dono,
 * limites e auditoria no banco); acaoDoDono invalida o cache da vitrine.
 */

const CAMINHO = '/app/empresa/link';

export async function salvarTextosPagina(entrada: TextosPaginaEntrada): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(textosPaginaSchema, entrada);
    if (!v.ok) return v.resultado;
    const d = v.dados;
    const p = {
      slogan: d.slogan,
      estilo: d.estilo,
      diferenciais: d.diferenciais,
      bairro: d.bairro,
      endereco: d.endereco,
      mostrar_endereco: d.mostrarEndereco,
    };
    await comUsuario(dono.id, (tx) =>
      tx.execute(sql`select public.salvar_pagina_publica(${JSON.stringify(p)}::jsonb)`),
    );
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: 'Página atualizada.' };
  });
}

export async function salvarGaleria(fotos: FotoGaleriaEntrada[]): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(galeriaSchema, fotos);
    if (!v.ok) return v.resultado;
    // só fotos da pasta da própria empresa (o banco confere de novo)
    const pasta = `${dono.empresa.id}/galeria/`;
    if (v.dados.some((f) => !f.caminho640.startsWith(pasta) || !f.caminho1280.startsWith(pasta))) {
      return { ok: false, erro: 'Foto inválida. Envie de novo.' };
    }
    const p = v.dados.map((f) => ({
      caminho_640: f.caminho640,
      caminho_1280: f.caminho1280,
      largura: f.largura,
      altura: f.altura,
      blur: f.blur ?? null,
      alt: f.alt,
    }));
    const [linha] = await comUsuario(dono.id, (tx) =>
      tx.execute<{ saiu: string[] }>(
        sql`select public.salvar_galeria(${JSON.stringify(p)}::jsonb) as saiu`,
      ),
    );
    // arquivos que saíram da galeria: apagados depois da gravação (falha só fica no log)
    await apagarArquivosMidia(linha?.saiu ?? []);
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: 'Galeria salva.' };
  });
}

export async function salvarDepoimentos(entrada: DepoimentosEntrada): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(depoimentosSchema, entrada);
    if (!v.ok) return v.resultado;
    const p = v.dados.itens.map((d) => ({ nome: d.nome, tipo_festa: d.tipoFesta, texto: d.texto }));
    await comUsuario(dono.id, (tx) =>
      tx.execute(sql`select public.salvar_depoimentos(${JSON.stringify(p)}::jsonb)`),
    );
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: 'Depoimentos salvos.' };
  });
}

export async function salvarPerguntas(entrada: PerguntasEntrada): Promise<ResultadoAcao> {
  return acaoDoDono(async (dono) => {
    const v = validar(perguntasSchema, entrada);
    if (!v.ok) return v.resultado;
    await comUsuario(dono.id, (tx) =>
      tx.execute(sql`select public.salvar_perguntas(${JSON.stringify(v.dados.itens)}::jsonb)`),
    );
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: 'Perguntas salvas.' };
  });
}
