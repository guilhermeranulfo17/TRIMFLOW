'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { redirect, unstable_rethrow } from 'next/navigation';
import { VERSAO_DOCUMENTOS } from '@/domain/legal/versao';
import { AcessoNegadoError, exigirPerfil } from '@/server/auth/guards';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { cancelarAssinatura } from '@/server/cobranca/fluxos';
import { processarAvisosSemFalhar } from '@/server/avisos/processar';
import { depsCobranca } from '@/server/cobranca/deps';
import { comUsuario } from '@/server/db/tenant';
import { logar } from '@/server/log';
import { idValido, NAO_ENCONTRADO, type ResultadoAcao } from './empresa/comum';

/*
 * LGPD (Etapa 9B, B.1). Só o dono. Diferente de acaoDoDono, vale também com a conta suspensa:
 * exportar, apagar a pedido do titular, aceitar termos e desistir da exclusão nunca podem travar.
 * A escrita é toda pelas funções SQL (auditoria e travas lá dentro).
 */

const MENSAGENS: Record<string, string> = {
  LEAD_NAO_ENCONTRADO: 'Lead não encontrado.',
  LGPD_RESERVA_FUTURA:
    'Este lead tem reserva confirmada de uma festa que ainda vai acontecer. Os dados são necessários para cumprir o contrato: apague depois do evento (ou cancele a reserva na Agenda).',
  RETENCAO_INVALIDA: 'Escolha um dos prazos da lista.',
  EXCLUSAO_NAO_AGENDADA: 'A exclusão da conta não está agendada.',
  SEM_PERMISSAO: 'Só o dono do buffet pode fazer isso.',
};

function mensagemDoErro(erro: unknown): string {
  const e = (erro as { cause?: unknown })?.cause ?? erro;
  const codigo = (e as { message?: string } | null)?.message ?? '';
  return MENSAGENS[codigo] ?? 'Não foi possível concluir agora. Tente de novo em instantes.';
}

async function acaoLgpd<T>(
  nome: string,
  fn: (dono: UsuarioAtual) => Promise<ResultadoAcao<T>>,
): Promise<ResultadoAcao<T>> {
  try {
    return await fn(await exigirPerfil('dono'));
  } catch (erro) {
    unstable_rethrow(erro);
    if (erro instanceof AcessoNegadoError) return { ok: false, erro: MENSAGENS.SEM_PERMISSAO! };
    const mensagem = mensagemDoErro(erro);
    if (!Object.values(MENSAGENS).includes(mensagem)) {
      logar('erro', `lgpd.${nome}`, { codigo: (erro as { code?: string }).code ?? 'sem-codigo' });
    }
    return { ok: false, erro: mensagem };
  }
}

/** Pedido do titular: apaga os dados pessoais do lead (precisa digitar APAGAR). */
export async function apagarDadosDoLead(
  leadId: string,
  confirmacao: string,
): Promise<ResultadoAcao> {
  return acaoLgpd('apagar_lead', async (dono) => {
    if (!idValido(leadId)) return { ok: false, erro: NAO_ENCONTRADO };
    if (confirmacao.trim().toUpperCase() !== 'APAGAR') {
      return {
        ok: false,
        erro: 'Digite APAGAR para confirmar.',
        campos: { confirmacao: 'Digite APAGAR para confirmar.' },
      };
    }
    await comUsuario(dono.id, (tx) => tx.execute(sql`select public.lgpd_apagar_lead(${leadId})`));
    revalidatePath('/app/leads', 'layout');
    revalidatePath('/app/tarefas');
    return { ok: true, mensagem: 'Dados pessoais apagados. O registro ficou na auditoria.' };
  });
}

export async function salvarRetencaoLeads(meses: number): Promise<ResultadoAcao> {
  return acaoLgpd('retencao', async (dono) => {
    if (![12, 24, 36, 60].includes(meses)) return { ok: false, erro: MENSAGENS.RETENCAO_INVALIDA! };
    await comUsuario(dono.id, (tx) =>
      tx.execute(sql`select public.salvar_retencao_leads(${meses}::int)`),
    );
    revalidatePath('/app/empresa/privacidade');
    return { ok: true, mensagem: 'Prazo de guarda dos leads salvo.' };
  });
}

/**
 * Exclusão da conta em 30 dias. Antes, cancela a assinatura no Asaas (nada de cobrança nova); se
 * o Asaas recusar, o pedido não é registrado.
 */
export async function solicitarExclusaoDaConta(confirmacao: string): Promise<ResultadoAcao> {
  return acaoLgpd('solicitar_exclusao', async (dono) => {
    if (confirmacao.trim().toUpperCase() !== 'EXCLUIR') {
      return {
        ok: false,
        erro: 'Digite EXCLUIR para confirmar.',
        campos: { confirmacao: 'Digite EXCLUIR para confirmar.' },
      };
    }
    const deps = depsCobranca();
    if (deps) {
      const r = await cancelarAssinatura(deps, {
        empresaId: dono.empresa.id,
        usuarioId: dono.id,
        motivo: 'outro',
        texto: 'Exclusão da conta (LGPD)',
      });
      if (!r.ok && r.erro !== 'Não há assinatura para cancelar.')
        return { ok: false, erro: r.erro };
    }
    await comUsuario(dono.id, (tx) => tx.execute(sql`select public.solicitar_exclusao_conta()`));
    after(processarAvisosSemFalhar);
    revalidatePath('/app', 'layout');
    return {
      ok: true,
      mensagem: 'Exclusão agendada para daqui a 30 dias. Até lá você pode exportar e desistir.',
    };
  });
}

export async function desistirDaExclusao(): Promise<ResultadoAcao> {
  return acaoLgpd('desistir_exclusao', async (dono) => {
    await comUsuario(dono.id, (tx) => tx.execute(sql`select public.desistir_exclusao_conta()`));
    revalidatePath('/app', 'layout');
    return {
      ok: true,
      mensagem:
        'Exclusão cancelada. Se você tinha assinatura, assine de novo em Minha empresa → Plano.',
    };
  });
}

/** Aceite da versão vigente dos Termos e da Privacidade (tela /app/aceite). */
export async function aceitarTermos(): Promise<ResultadoAcao> {
  try {
    const dono = await exigirPerfil('dono');
    await comUsuario(dono.id, (tx) =>
      tx.execute(sql`select public.registrar_aceite(${VERSAO_DOCUMENTOS})`),
    );
  } catch (erro) {
    unstable_rethrow(erro);
    logar('erro', 'lgpd.aceite', { codigo: (erro as { code?: string }).code ?? 'sem-codigo' });
    return { ok: false, erro: 'Não foi possível registrar o aceite. Tente de novo.' };
  }
  redirect('/app/leads');
}
