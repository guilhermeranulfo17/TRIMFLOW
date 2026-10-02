import { REGRAS_FOLLOW_UP, type RegraFollowUp } from '@/domain/follow-up/regras';
import { MOTIVO_REGRA, situacaoDaRegra } from '@/domain/follow-up/titulos';
import type { SituacaoMensagem } from '@/domain/leads/mensagens';

/** Tarefa criada pelo follow-up automático: situação da mensagem pronta e motivo do selo. */
export function automaticaDaTarefa(
  origem: string,
  regra: string | null,
  dados: Record<string, unknown> | null,
): { situacao: SituacaoMensagem; motivo: string } | null {
  if (origem !== 'regra' || !regra || !(REGRAS_FOLLOW_UP as readonly string[]).includes(regra)) {
    return null;
  }
  const r = regra as RegraFollowUp;
  return { situacao: situacaoDaRegra(r, dados?.proposta_aberta === true), motivo: MOTIVO_REGRA[r] };
}
