'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';
import { arquivoContrato } from '@/domain/contratos/documento';
import { emailCopiaContrato } from '@/domain/email/contrato';
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
import { enviarEmailContrato } from '@/server/contratos/email';
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
    // o PDF final é gerado e guardado logo depois da resposta (o download sai pronto) e, se o
    // dono marcou, a cópia vai para o e-mail do cliente
    after(() => posAssinatura(slug, token, d.ipHash));
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

async function posAssinatura(slug: string, token: string, ipHash: string): Promise<void> {
  try {
    const c = await carregarComprovantePublico(slug, token, ipHash);
    if (!c || c === 'limite') return;
    const buffet = await lerBuffet(slug);
    const identidade = {
      nome: buffet?.nome ?? '',
      logoUrl: buffet?.logoUrl ?? null,
      corMarca: buffet?.corMarca ?? null,
    };
    const pdf = await obterPdfContrato(c, identidade, {
      marcar: async () => {
        await comAnon((tx) =>
          tx.execute(sql`select publico.contrato_marcar_pdf(${slug}, ${token})`),
        );
      },
    });
    // cópia por e-mail: o banco devolve o e-mail e marca o envio de uma vez (nunca duas)
    const [linha] = await comAnon((tx) =>
      tx.execute<{ c: { id: string; email: string } | null }>(
        sql`select publico.contrato_copia_email(${slug}, ${token}) as c`,
      ),
    );
    const copia = linha?.c;
    if (!copia) return;
    const cliente = c.assinaturas.find((a) => a.parte === 'cliente')?.nome ?? null;
    const r = await enviarEmailContrato(
      copia.email,
      emailCopiaContrato({ buffet: identidade.nome, contrato: c.codigo, cliente }),
      `copia-${copia.id}`,
      {
        tag: 'contrato_copia',
        anexos: [
          {
            arquivo: arquivoContrato({ codigo: c.codigo, buffet: identidade.nome, cliente }).nome,
            conteudo: pdf,
          },
        ],
      },
    );
    if (!r.ok) logar('aviso', 'contrato.copia_email_falhou', { contratoId: c.id, codigo: r.erro });
  } catch (erro) {
    logar('aviso', 'contrato.pos_assinatura_falhou', { codigo: codigoDoErro(erro) });
  }
}
