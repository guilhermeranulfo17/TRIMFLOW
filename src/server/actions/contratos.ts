'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { mensagemEnvioContrato } from '@/domain/contratos/mensagens';
import { linkWhatsApp } from '@/domain/publico/whatsapp';
import { emissaoSchema, emitirContrato } from '@/server/contratos/emitir';
import { comUsuario } from '@/server/db/tenant';
import { siteUrl } from '@/server/env';
import { hashIpDoVisitante } from '@/server/publico/seguranca';
import { acaoDoDono, validar, type ResultadoAcao } from './empresa/comum';

/*
 * Painel (Etapa 10): enviar o contrato a partir do orçamento. O dono assina ao enviar; o texto
 * é montado de novo no servidor (o navegador só manda o que faltava, a validade e o "exigir
 * código"). Erros do banco (limite do plano, demo, conta suspensa) viram mensagem simples.
 */

const MENSAGENS: Record<string, string> = {
  CONTRATO_SO_DONO: 'Só o dono do buffet pode enviar contratos.',
  CONTRATO_LEAD_INVALIDO: 'Este cliente não está mais disponível.',
  CONTRATO_ORCAMENTO_INVALIDO: 'Este orçamento não está mais disponível. Recarregue a página.',
  CONTRATO_SEM_ORIGEM: 'Gere o contrato a partir de um orçamento ou de uma reserva.',
  CONTRATO_CODIGO_SEM_EMAIL: 'O cliente não tem e-mail: envie sem o código.',
  CONTRATO_NAO_REFAZ: 'Este contrato não pode ser refeito.',
  CONTRATO_VARIAVEL_FALTANDO: 'Ainda falta preencher algum campo do contrato.',
};

function mensagemDoErro(erro: unknown): string | null {
  const e = erro as { message?: string; cause?: { message?: string } } | null;
  const codigo = e?.cause?.message ?? e?.message ?? '';
  return MENSAGENS[codigo] ?? null;
}

export type ContratoEnviado = {
  id: string;
  codigo: string;
  link: string;
  linkWhatsapp: string | null;
  expiraEm: string;
};

export async function enviarContrato(entrada: unknown): Promise<ResultadoAcao<ContratoEnviado>> {
  const v = validar(emissaoSchema, entrada);
  if (!v.ok) return v.resultado;
  return acaoDoDono(async (dono) => {
    const h = await headers();
    const ipHash = await hashIpDoVisitante();
    let r;
    try {
      r = await comUsuario(dono.id, (tx) =>
        emitirContrato(dono, v.dados, tx, { ipHash, userAgent: h.get('user-agent') }),
      );
    } catch (erro) {
      const m = mensagemDoErro(erro);
      if (m) return { ok: false, erro: m };
      throw erro;
    }
    if (!r.ok) {
      if ('faltando' in r) {
        return { ok: false, erro: `Preencha antes de enviar: ${r.faltando.join(', ')}.` };
      }
      return { ok: false, erro: 'Este orçamento não está mais disponível. Recarregue a página.' };
    }
    const link = `${siteUrl()}/b/${dono.empresa.slug}/contrato/${r.token}`;
    revalidatePath('/app/leads', 'layout');
    return {
      ok: true,
      mensagem: `Contrato ${r.codigo} enviado.`,
      dados: {
        id: r.id,
        codigo: r.codigo,
        link,
        linkWhatsapp: r.clienteWhatsapp
          ? linkWhatsApp(
              r.clienteWhatsapp,
              mensagemEnvioContrato(dono.empresa.nome, r.clienteNome, link),
            )
          : null,
        expiraEm: r.expiraEm,
      },
    };
  });
}
