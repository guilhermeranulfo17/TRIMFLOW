import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { formatData } from '@/domain/dates';
import { MENSAGEM_AGENDA_PADRAO, traduzirErroAgenda } from '@/domain/agenda';
import { AcessoNegadoError, exigirPerfil } from '@/server/auth/guards';
import type { UsuarioAtual } from '@/server/auth/sessao';
import type { Perfil } from '@/server/db/schema';
import type { ResultadoAcao } from '@/server/actions/empresa/comum';

/** Erro do banco numa ação da agenda → mensagem simples (nunca a técnica). */
export function mensagemErroAgenda(erro: unknown): string {
  const e = (erro as { cause?: unknown })?.cause ?? erro;
  const { message, detail } = (e ?? {}) as { message?: string; detail?: string };
  const traduzida = traduzirErroAgenda(message);
  if (traduzida && message === 'AGENDA_BLOQUEIO_COM_RESERVA' && detail) {
    return `Há reserva ou pré-reserva em ${formatData(detail)}. Cancele antes de bloquear.`;
  }
  return traduzida ?? MENSAGEM_AGENDA_PADRAO;
}

/**
 * Envolve uma ação da agenda: exige um dos perfis, traduz erros do banco e deixa passar os
 * redirecionamentos do Next (sessão expirada).
 */
export async function acaoDaAgenda<T>(
  perfis: [Perfil, ...Perfil[]],
  fn: (usuario: UsuarioAtual) => Promise<ResultadoAcao<T>>,
): Promise<ResultadoAcao<T>> {
  try {
    const usuario = await exigirPerfil(...perfis);
    return await fn(usuario);
  } catch (erro) {
    unstable_rethrow(erro);
    if (erro instanceof AcessoNegadoError) {
      return { ok: false, erro: 'Só o dono do buffet pode fazer isso.' };
    }
    const mensagem = mensagemErroAgenda(erro);
    if (mensagem === MENSAGEM_AGENDA_PADRAO) console.error('[agenda]', erro);
    return { ok: false, erro: mensagem };
  }
}
