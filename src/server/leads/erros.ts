import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { traduzirErroAgenda } from '@/domain/agenda';
import { mensagemErroConta } from '@/domain/cobranca/limites';
import type { ResultadoAcao } from '@/server/actions/empresa/comum';
import { exigirSessao, type UsuarioAtual } from '@/server/auth/sessao';
import { logar } from '@/server/log';

/*
 * Ações do vendedor no lead: dono e vendedor ativos. Erros do banco viram mensagens simples
 * (códigos estáveis das funções SQL); nada técnico chega à tela.
 */

const MENSAGENS: Record<string, string> = {
  LEAD_NAO_ENCONTRADO: 'Lead não encontrado.',
  LEAD_SEM_PERMISSAO: 'Você não tem acesso a este lead.',
  LEAD_SO_ASSUMIR:
    'Você só pode assumir o lead para você. Peça ao dono para passar a outra pessoa.',
  LEAD_USUARIO_INVALIDO: 'Escolha um usuário ativo da empresa.',
  LEAD_DADOS_INVALIDOS: 'Confira os dados.',
  LEAD_MOTIVO_OBRIGATORIO: 'Conte o motivo em poucas palavras.',
  LEAD_RESERVADO_NAO_PERDE:
    'Este lead tem reserva confirmada. Para desistir, cancele a reserva na Agenda.',
  LEAD_ESTADO_INVALIDO: 'O lead mudou enquanto você estava na tela. Recarregue e tente de novo.',
  NOTA_TEXTO_INVALIDO: 'Escreva a nota (até 2000 caracteres).',
  NOTA_NAO_ENCONTRADA: 'Nota não encontrada.',
  NOTA_SO_AUTOR: 'Só quem escreveu pode alterar esta nota.',
  NOTA_PRAZO_ENCERRADO: 'A nota só pode ser alterada nas primeiras 24 horas.',
  TAREFA_NAO_ENCONTRADA: 'Tarefa não encontrada.',
  TAREFA_ESTADO_INVALIDO: 'Esta tarefa já foi concluída ou cancelada.',
  TAREFA_DATA_INVALIDA: 'Escolha um dia e hora no futuro.',
  TAREFA_DADOS_INVALIDOS: 'Confira o título e o dia da tarefa.',
  TAREFA_DUPLICADA: 'Já existe uma tarefa igual aberta para este lead.',
  VISITA_NAO_ENCONTRADA: 'Visita não encontrada.',
  VISITA_ESTADO_INVALIDO: 'Esta visita mudou. Recarregue a página.',
  VISITA_DATA_INVALIDA: 'Escolha um dia e hora a partir de agora.',
  VISITA_DADOS_INVALIDOS: 'Confira os dados da visita.',
  ORCAMENTO_NAO_ENCONTRADO: 'Orçamento não encontrado.',
};

export const MENSAGEM_LEAD_PADRAO = 'Não foi possível salvar agora. Tente de novo em instantes.';

export function mensagemErroLead(erro: unknown): string {
  const e = (erro as { cause?: unknown })?.cause ?? erro;
  const codigo = (e as { message?: string } | null)?.message ?? '';
  return (
    MENSAGENS[codigo] ??
    mensagemErroConta(codigo) ??
    traduzirErroAgenda(codigo) ??
    MENSAGEM_LEAD_PADRAO
  );
}

export async function acaoDoLead<T>(
  fn: (usuario: UsuarioAtual) => Promise<ResultadoAcao<T>>,
): Promise<ResultadoAcao<T>> {
  try {
    return await fn(await exigirSessao());
  } catch (erro) {
    unstable_rethrow(erro);
    const mensagem = mensagemErroLead(erro);
    if (mensagem === MENSAGEM_LEAD_PADRAO) logar('erro', 'leads.erro_inesperado');
    return { ok: false, erro: mensagem };
  }
}
