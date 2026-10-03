import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { estiloValido, type EstiloPagina, type Segmento } from '@/domain/publico/pagina';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { depoimentos, empresas, galeriaFotos, perguntasFrequentes } from '@/server/db/schema';
import { naTransacao, type Tx } from '@/server/db/tenant';

/** Estado atual do editor da página pública (RLS: só o dono lê as tabelas novas). */
export type EditorPagina = {
  segmento: Segmento;
  textos: {
    slogan: string;
    estilo: EstiloPagina | '';
    diferenciais: string[];
    bairro: string;
    endereco: string;
    mostrarEndereco: boolean;
  };
  galeria: {
    caminho640: string;
    caminho1280: string;
    largura: number;
    altura: number;
    blur: string | null;
    alt: string;
  }[];
  depoimentos: { nome: string; tipoFesta: string; texto: string }[];
  perguntas: { pergunta: string; resposta: string }[];
};

export async function carregarEditorPagina(usuario: UsuarioAtual, tx?: Tx): Promise<EditorPagina> {
  return naTransacao(usuario.id, tx, async (tx) => {
    const [[e], fotos, deps, pergs] = await Promise.all([
      tx
        .select({
          segmento: empresas.segmento,
          slogan: empresas.slogan,
          estilo: empresas.estilo,
          diferenciais: empresas.diferenciais,
          bairro: empresas.bairro,
          endereco: empresas.endereco,
          mostrarEndereco: empresas.mostrarEndereco,
        })
        .from(empresas)
        .where(eq(empresas.id, usuario.empresa.id)),
      tx.select().from(galeriaFotos).orderBy(asc(galeriaFotos.ordem)),
      tx.select().from(depoimentos).orderBy(asc(depoimentos.ordem)),
      tx.select().from(perguntasFrequentes).orderBy(asc(perguntasFrequentes.ordem)),
    ]);
    return {
      segmento: e!.segmento,
      textos: {
        slogan: e!.slogan ?? '',
        estilo: estiloValido(e!.estilo) ? e!.estilo : '',
        diferenciais: e!.diferenciais ?? [],
        bairro: e!.bairro ?? '',
        endereco: e!.endereco ?? '',
        mostrarEndereco: e!.mostrarEndereco,
      },
      galeria: fotos.map((f) => ({
        caminho640: f.caminho640,
        caminho1280: f.caminho1280,
        largura: f.largura,
        altura: f.altura,
        blur: f.blur,
        alt: f.alt ?? '',
      })),
      depoimentos: deps.map((d) => ({
        nome: d.nome,
        tipoFesta: d.tipoFesta ?? '',
        texto: d.texto,
      })),
      perguntas: pergs.map((p) => ({ pergunta: p.pergunta, resposta: p.resposta })),
    };
  });
}
