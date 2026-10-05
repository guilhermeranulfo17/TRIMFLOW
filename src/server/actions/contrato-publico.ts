'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';
import { slugValido } from '@/domain/slug';
import { lerBuffet } from '@/server/publico/carregar';
import { obterPdfContrato } from '@/server/contratos/arquivo';
import {
  assinar,
  pedirCodigo,
  recusar,
  type ResultadoAssinatura,
  type Resultado,
} from '@/server/contratos/assinatura';
import { carregarComprovantePublico } from '@/server/contratos/carregar';
import { comAnon } from '@/server/db/anon';
import { codigoDoErro, logar } from '@/server/log';
import { ehModoTeste } from '@/server/publico/sessao';
import { hashIpDoVisitante } from '@/server/publico/seguranca';
import { sql } from 'drizzle-orm';

/*
 * Ações do cliente no link do contrato (sem login). O modo teste (usuário logado da própria
 * empresa) vem da sessão no servidor, nunca do navegador.
 */

async function deps(slug: string) {
  const h = await headers();
  return {
    ipHash: await hashIpDoVisitante(),
    userAgent: h.get('user-agent'),
    modoTeste: await ehModoTeste(slug),
  };
}

const INVALIDO = { ok: false as const, erro: 'Este link não está mais disponível.' };

export async function pedirCodigoContrato(
  slug: string,
  token: string,
): Promise<Resultado<{ email: string }>> {
  if (!slugValido(slug)) return INVALIDO;
  try {
    return await pedirCodigo(slug, token, await deps(slug));
  } catch (erro) {
    logar('erro', 'contrato.pedir_codigo_falhou', { codigo: codigoDoErro(erro) });
    return {
      ok: false,
      erro: 'Não foi possível enviar o código agora. Tente de novo em instantes.',
    };
  }
}

export async function assinarContrato(
  slug: string,
  token: string,
  entrada: unknown,
): Promise<ResultadoAssinatura> {
  if (!slugValido(slug)) return INVALIDO;
  const d = await deps(slug);
  const r = await assinar(slug, token, entrada, d);
  if (r.ok) {
    // o PDF final é gerado e guardado logo depois da resposta: o download sai pronto
    after(() => prepararPdf(slug, token, d.ipHash));
  }
  return r;
}

export async function recusarContrato(
  slug: string,
  token: string,
  motivo: string,
): Promise<Resultado> {
  if (!slugValido(slug)) return INVALIDO;
  try {
    return await recusar(slug, token, String(motivo ?? ''), await deps(slug));
  } catch (erro) {
    logar('erro', 'contrato.recusar_falhou', { codigo: codigoDoErro(erro) });
    return { ok: false, erro: 'Não foi possível registrar agora. Tente de novo em instantes.' };
  }
}

async function prepararPdf(slug: string, token: string, ipHash: string): Promise<void> {
  try {
    const c = await carregarComprovantePublico(slug, token, ipHash);
    if (!c || c === 'limite' || c.pdfGeradoEm) return;
    const buffet = await lerBuffet(slug);
    await obterPdfContrato(
      c,
      {
        nome: buffet?.nome ?? '',
        logoUrl: buffet?.logoUrl ?? null,
        corMarca: buffet?.corMarca ?? null,
      },
      {
        marcar: async () => {
          await comAnon((tx) =>
            tx.execute(sql`select publico.contrato_marcar_pdf(${slug}, ${token})`),
          );
        },
      },
    );
  } catch (erro) {
    logar('aviso', 'contrato.pdf_preparar_falhou', { codigo: codigoDoErro(erro) });
  }
}
