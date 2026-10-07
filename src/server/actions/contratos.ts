'use server';

import { sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { opcoesContratoSchema } from '@/domain/contratos/opcoes';
import { analisarModelo, TAMANHO_MAXIMO_MODELO } from '@/domain/contratos/variaveis';
import { mensagemEnvioContrato, mensagemLembreteContrato } from '@/domain/contratos/mensagens';
import { linkWhatsApp } from '@/domain/publico/whatsapp';
import { SEGMENTOS } from '@/domain/segmento';
import { AcessoNegadoError, exigirPerfil } from '@/server/auth/guards';
import { emissaoSchema, emitirContrato } from '@/server/contratos/emitir';
import { decifrarCpf, gerarTokenContrato } from '@/server/contratos/segredos';
import { contratos, leads } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { siteUrl } from '@/server/env';
import { codigoDoErro, logar } from '@/server/log';
import { hashIpDoVisitante } from '@/server/publico/seguranca';
import { and, eq } from 'drizzle-orm';
import { acaoDoDono, idValido, validar, type ResultadoAcao } from './empresa/comum';

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
  CONTRATO_NAO_ENCONTRADO: 'Este contrato não existe mais. Recarregue a página.',
  CONTRATO_CONCLUIDO: 'Contrato assinado não pode ser cancelado.',
  CONTRATO_SEM_LINK: 'Este contrato não está mais esperando assinatura.',
  CONTRATO_MODELO_INVALIDO: 'Confira o texto do modelo.',
  CONTRATO_MODELO_NAO_ENCONTRADO: 'Este modelo não existe mais. Recarregue a página.',
  LIMITE_PLANO_CONTRATOS: 'Você chegou ao limite de contratos do mês no seu plano.',
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

// ---------------------------------------------------------------------------------------------
// Etapa 10, PR 2: ações do detalhe do contrato e dos modelos
// ---------------------------------------------------------------------------------------------

/** Erro de negócio conhecido → mensagem; o resto sobe para o acaoDoDono. */
async function comMensagem<T>(fn: () => Promise<ResultadoAcao<T>>): Promise<ResultadoAcao<T>> {
  try {
    return await fn();
  } catch (erro) {
    const m = mensagemDoErro(erro);
    if (m) return { ok: false, erro: m };
    throw erro;
  }
}

function revalidarContrato(id: string) {
  revalidatePath('/app/contratos', 'layout');
  revalidatePath(`/app/contratos/${id}`);
  revalidatePath('/app/leads', 'layout');
}

export async function cancelarContratoAcao(id: string, motivo: string): Promise<ResultadoAcao> {
  if (!idValido(id)) return { ok: false, erro: MENSAGENS.CONTRATO_NAO_ENCONTRADO! };
  const m = String(motivo ?? '')
    .trim()
    .slice(0, 300);
  return acaoDoDono((dono) =>
    comMensagem(async () => {
      await comUsuario(dono.id, (tx) =>
        tx.execute(sql`select public.cancelar_contrato(${id}::uuid, ${m || null})`),
      );
      revalidarContrato(id);
      return { ok: true, mensagem: 'Contrato cancelado. O link parou de funcionar.' };
    }),
  );
}

export type LinkNovo = { link: string; linkWhatsapp: string | null; expiraEm: string };

/**
 * Link novo para o mesmo contrato (lembrar o cliente ou o link venceu): o token antigo para de
 * abrir, porque o banco só guarda o hash e não há como mostrar o link anterior de novo.
 */
export async function novoLinkContrato(
  id: string,
  validadeDias: number,
): Promise<ResultadoAcao<LinkNovo>> {
  if (!idValido(id)) return { ok: false, erro: MENSAGENS.CONTRATO_NAO_ENCONTRADO! };
  const dias = z.number().int().min(1).max(60).safeParse(Number(validadeDias));
  if (!dias.success) return { ok: false, erro: 'Escolha a validade do link.' };
  return acaoDoDono((dono) =>
    comMensagem(async () => {
      const { token, hash } = gerarTokenContrato();
      const r = await comUsuario(dono.id, async (tx) => {
        const [l] = await tx.execute<{ expira: string }>(
          sql`select public.novo_link_contrato(${id}::uuid, ${hash}, ${dias.data}) as expira`,
        );
        const [c] = await tx
          .select({ nome: leads.nome, whatsapp: leads.whatsappE164 })
          .from(contratos)
          .innerJoin(leads, eq(leads.id, contratos.leadId))
          .where(and(eq(contratos.id, id), eq(contratos.empresaId, dono.empresa.id)))
          .limit(1);
        return { expira: l!.expira, cliente: c };
      });
      const link = `${siteUrl()}/b/${dono.empresa.slug}/contrato/${token}`;
      revalidarContrato(id);
      return {
        ok: true,
        mensagem: 'Link novo pronto. O anterior parou de funcionar.',
        dados: {
          link,
          expiraEm: new Date(r.expira).toISOString(),
          linkWhatsapp: r.cliente?.whatsapp
            ? linkWhatsApp(
                r.cliente.whatsapp,
                mensagemLembreteContrato(dono.empresa.nome, r.cliente.nome, link),
              )
            : null,
        },
      };
    }),
  );
}

/**
 * CPF completo do cliente (o dono pede, fica na auditoria). Leitura: vale também com a conta
 * somente leitura. Nunca vai para log.
 */
export async function verCpfContrato(id: string): Promise<ResultadoAcao<{ cpf: string }>> {
  if (!idValido(id)) return { ok: false, erro: MENSAGENS.CONTRATO_NAO_ENCONTRADO! };
  try {
    const dono = await exigirPerfil('dono');
    const cpf = await comUsuario(dono.id, async (tx) => {
      const [l] = await tx.execute<{ doc: string; hash: string }>(
        sql`select public.ler_cpf_contrato(${id}::uuid) as doc,
              (select c.hash from public.contratos c where c.id = ${id}::uuid) as hash`,
      );
      return l ? decifrarCpf(l.doc, l.hash) : null;
    });
    if (!cpf) return { ok: false, erro: 'Não foi possível abrir o CPF deste contrato.' };
    const d = cpf.replace(/\D/g, '');
    return {
      ok: true,
      mensagem: 'CPF aberto. Fica registrado no histórico do contrato.',
      dados: { cpf: `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}` },
    };
  } catch (erro) {
    unstable_rethrow(erro);
    if (erro instanceof AcessoNegadoError) {
      return { ok: false, erro: 'Só o dono do buffet vê o CPF.' };
    }
    logar('erro', 'contrato.ver_cpf_falhou', { codigo: codigoDoErro(erro) });
    return { ok: false, erro: 'Não foi possível abrir o CPF agora. Tente de novo em instantes.' };
  }
}

const modeloSchema = z.object({
  id: z.uuid().nullish(),
  titulo: z.string().trim().min(2, 'Dê um nome ao modelo.').max(120, 'Nome muito longo.'),
  segmento: z.enum(SEGMENTOS),
  texto: z
    .string()
    .min(20, 'O texto está muito curto.')
    .max(TAMANHO_MAXIMO_MODELO, 'O texto passou do tamanho máximo.'),
  origem: z
    .string()
    .regex(/^[a-z_]+@[0-9]{1,4}$/)
    .nullish(),
  ativo: z.boolean().default(true),
  opcoes: opcoesContratoSchema,
});

/** Salva o modelo da empresa (novo = cópia do modelo do sistema). Variáveis conferidas aqui. */
export async function salvarModeloContrato(
  entrada: unknown,
): Promise<ResultadoAcao<{ id: string }>> {
  const v = validar(modeloSchema, entrada);
  if (!v.ok) return v.resultado;
  const analise = analisarModelo(v.dados.texto);
  if (!analise.ok) {
    return { ok: false, erro: analise.erros[0]!, campos: { texto: analise.erros.join(' ') } };
  }
  return acaoDoDono((dono) =>
    comMensagem(async () => {
      const p = {
        id: v.dados.id ?? null,
        titulo: v.dados.titulo,
        segmento: v.dados.segmento,
        texto: v.dados.texto.replace(/\r\n/g, '\n'),
        origem: v.dados.origem ?? null,
        ativo: v.dados.ativo,
        opcoes: v.dados.opcoes,
      };
      const id = await comUsuario(dono.id, async (tx) => {
        const [l] = await tx.execute<{ id: string }>(
          sql`select public.salvar_contrato_modelo(${JSON.stringify(p)}::jsonb) as id`,
        );
        return l!.id;
      });
      revalidatePath('/app/contratos/modelos', 'layout');
      return { ok: true, mensagem: 'Modelo salvo.', dados: { id } };
    }),
  );
}

/** Liga ou desliga um modelo (o desligado não é usado em contratos novos). */
export async function ativarModeloContrato(id: string, ativo: boolean): Promise<ResultadoAcao> {
  if (!idValido(id)) return { ok: false, erro: MENSAGENS.CONTRATO_MODELO_NAO_ENCONTRADO! };
  return acaoDoDono((dono) =>
    comMensagem(async () => {
      await comUsuario(dono.id, (tx) =>
        tx.execute(
          sql`select public.salvar_contrato_modelo(${JSON.stringify({ id, ativo: Boolean(ativo) })}::jsonb)`,
        ),
      );
      revalidatePath('/app/contratos/modelos', 'layout');
      return { ok: true, mensagem: ativo ? 'Modelo ligado.' : 'Modelo desligado.' };
    }),
  );
}
