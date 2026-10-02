'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { interpretarQuando, quandoAdiar, type FiltrosCaixa } from '@/domain/leads';
import {
  montarMensagem,
  SITUACOES_MENSAGEM,
  situacaoDoMomento,
  type SituacaoMensagem,
} from '@/domain/leads/mensagens';
import { linkWhatsApp } from '@/domain/publico/whatsapp';
import {
  adiarSchema,
  contatoSchema,
  dadosLeadSchema,
  notaSchema,
  perdidoSchema,
  proximoContatoSchema,
  tarefaSchema,
  visitaSchema,
  type AdiarEntrada,
  type ContatoEntrada,
  type DadosLeadEntrada,
  type NotaEntrada,
  type PerdidoEntrada,
  type TarefaEntrada,
  type VisitaEntrada,
} from '@/domain/validacao/leads';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { comUsuario } from '@/server/db/tenant';
import { acaoDoLead } from '@/server/leads/erros';
import {
  dadosDaMensagem,
  listarCaixa,
  type CursorCaixa,
  type PaginaCaixa,
} from '@/server/leads/carregar';
import { idValido, NAO_ENCONTRADO, validar, type ResultadoAcao } from './empresa/comum';

/*
 * Ações do vendedor no lead (dono e vendedor). Toda escrita vai pelas funções SQL security
 * definer (auditoria, travas e códigos de erro); aqui só validação, datas no fuso da empresa e
 * revalidação das telas.
 */

function revalidar(leadId?: string) {
  revalidatePath('/app/leads', 'layout');
  revalidatePath('/app/tarefas');
  if (leadId) revalidatePath(`/app/leads/${leadId}`);
}

const DATA_INVALIDA = {
  ok: false as const,
  erro: 'Confira os campos destacados.',
  campos: { quando: 'Escolha um dia e hora no futuro (ex.: amanhã 9h).' },
};

function instante(usuario: UsuarioAtual, texto: string): Date | null {
  return interpretarQuando(texto, new Date(), usuario.empresa.fuso);
}

async function chamar(usuario: UsuarioAtual, consulta: ReturnType<typeof sql>) {
  return comUsuario(usuario.id, (tx) => tx.execute<Record<string, unknown>>(consulta));
}

// ---------------------------------------------------------------------------
// Caixa (carregar mais)
// ---------------------------------------------------------------------------
export async function carregarMaisLeads(
  filtros: FiltrosCaixa,
  cursor: CursorCaixa,
): Promise<ResultadoAcao<PaginaCaixa>> {
  return acaoDoLead(async (usuario) => ({
    ok: true,
    mensagem: '',
    dados: await listarCaixa(usuario, filtros, cursor),
  }));
}

// ---------------------------------------------------------------------------
// Contato, dados, responsável
// ---------------------------------------------------------------------------
export async function registrarContato(
  leadId: string,
  entrada: ContatoEntrada,
): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(leadId)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(contatoSchema, entrada);
    if (!v.ok) return v.resultado;
    await chamar(
      usuario,
      sql`select public.registrar_contato(${leadId}::uuid,
        ${v.dados.canal}::public.canal_contato, ${v.dados.resumo || null})`,
    );
    revalidar(leadId);
    return { ok: true, mensagem: 'Contato registrado.' };
  });
}

export async function atualizarDadosLead(
  leadId: string,
  entrada: DadosLeadEntrada,
): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(leadId)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(dadosLeadSchema, entrada);
    if (!v.ok) return v.resultado;
    await chamar(
      usuario,
      sql`select public.atualizar_dados_lead(${leadId}::uuid, ${v.dados.nome}, ${v.dados.email || null})`,
    );
    revalidar(leadId);
    return { ok: true, mensagem: 'Dados atualizados.' };
  });
}

/** Vendedor: "Assumir" (para si). Dono: atribuir a qualquer usuário ativo. */
export async function atribuirResponsavel(
  leadId: string,
  usuarioId: string | null,
): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    const para = usuarioId ?? usuario.id;
    if (!idValido(leadId) || !idValido(para)) return { ok: false, erro: NAO_ENCONTRADO };
    await chamar(usuario, sql`select public.atribuir_responsavel(${leadId}::uuid, ${para}::uuid)`);
    revalidar(leadId);
    return {
      ok: true,
      mensagem: para === usuario.id ? 'Agora o lead é seu.' : 'Responsável alterado.',
    };
  });
}

// ---------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------
export async function adicionarNota(leadId: string, entrada: NotaEntrada): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(leadId)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(notaSchema, entrada);
    if (!v.ok) return v.resultado;
    await chamar(usuario, sql`select public.adicionar_nota(${leadId}::uuid, ${v.dados.texto})`);
    revalidar(leadId);
    return { ok: true, mensagem: 'Nota salva.' };
  });
}

export async function editarNota(
  notaId: string,
  leadId: string,
  entrada: NotaEntrada,
): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(notaId)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(notaSchema, entrada);
    if (!v.ok) return v.resultado;
    await chamar(usuario, sql`select public.editar_nota(${notaId}::uuid, ${v.dados.texto})`);
    revalidar(leadId);
    return { ok: true, mensagem: 'Nota alterada.' };
  });
}

export async function apagarNota(notaId: string, leadId: string): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(notaId)) return { ok: false, erro: NAO_ENCONTRADO };
    await chamar(usuario, sql`select public.apagar_nota(${notaId}::uuid)`);
    revalidar(leadId);
    return { ok: true, mensagem: 'Nota apagada.' };
  });
}

// ---------------------------------------------------------------------------
// Tarefas e próximo contato
// ---------------------------------------------------------------------------
export async function criarTarefa(
  leadId: string,
  entrada: TarefaEntrada,
): Promise<ResultadoAcao<{ id: string }>> {
  return acaoDoLead<{ id: string }>(async (usuario) => {
    if (!idValido(leadId)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(tarefaSchema, entrada);
    if (!v.ok) return v.resultado;
    const vence = instante(usuario, v.dados.quando);
    if (!vence) return DATA_INVALIDA;
    const [r] = await chamar(
      usuario,
      sql`select public.criar_tarefa(${leadId}::uuid, ${v.dados.titulo},
        ${vence.toISOString()}::timestamptz, ${v.dados.descricao || null}) as id`,
    );
    revalidar(leadId);
    return { ok: true, mensagem: 'Tarefa criada.', dados: { id: r!.id as string } };
  });
}

export async function concluirTarefa(tarefaId: string): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(tarefaId)) return { ok: false, erro: NAO_ENCONTRADO };
    await chamar(usuario, sql`select public.concluir_tarefa(${tarefaId}::uuid)`);
    revalidar();
    return { ok: true, mensagem: 'Tarefa concluída.' };
  });
}

export async function adiarTarefa(
  tarefaId: string,
  entrada: AdiarEntrada,
): Promise<ResultadoAcao<{ para: string }>> {
  return acaoDoLead<{ para: string }>(async (usuario) => {
    if (!idValido(tarefaId)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(adiarSchema, entrada);
    if (!v.ok) return v.resultado;
    const para =
      'opcao' in v.dados
        ? quandoAdiar(v.dados.opcao, new Date(), usuario.empresa.fuso)
        : instante(usuario, v.dados.quando);
    if (!para) return DATA_INVALIDA;
    await chamar(
      usuario,
      sql`select public.adiar_tarefa(${tarefaId}::uuid, ${para.toISOString()}::timestamptz)`,
    );
    revalidar();
    return { ok: true, mensagem: 'Tarefa adiada.', dados: { para: para.toISOString() } };
  });
}

export async function reabrirTarefa(tarefaId: string): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(tarefaId)) return { ok: false, erro: NAO_ENCONTRADO };
    await chamar(usuario, sql`select public.reabrir_tarefa(${tarefaId}::uuid)`);
    revalidar();
    return { ok: true, mensagem: 'Tarefa reaberta.' };
  });
}

export async function cancelarTarefa(tarefaId: string): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(tarefaId)) return { ok: false, erro: NAO_ENCONTRADO };
    await chamar(usuario, sql`select public.cancelar_tarefa(${tarefaId}::uuid)`);
    revalidar();
    return { ok: true, mensagem: 'Tarefa cancelada.' };
  });
}

export async function definirProximoContato(
  leadId: string,
  entrada: { quando: string },
): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(leadId)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(proximoContatoSchema, entrada);
    if (!v.ok) return v.resultado;
    const quando = instante(usuario, v.dados.quando);
    if (!quando) return DATA_INVALIDA;
    await chamar(
      usuario,
      sql`select public.definir_proximo_contato(${leadId}::uuid, ${quando.toISOString()}::timestamptz)`,
    );
    revalidar(leadId);
    return { ok: true, mensagem: 'Próximo contato marcado.' };
  });
}

// ---------------------------------------------------------------------------
// Perdido e reabrir
// ---------------------------------------------------------------------------
export async function marcarPerdido(
  leadId: string,
  entrada: PerdidoEntrada,
): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(leadId)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(perdidoSchema, entrada);
    if (!v.ok) return v.resultado;
    await chamar(
      usuario,
      sql`select public.marcar_perdido(${leadId}::uuid, ${v.dados.motivo}::public.motivo_perda,
        ${v.dados.detalhe || null})`,
    );
    revalidar(leadId);
    revalidatePath('/app/agenda');
    return { ok: true, mensagem: 'Lead marcado como perdido.' };
  });
}

export async function reabrirLead(leadId: string): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(leadId)) return { ok: false, erro: NAO_ENCONTRADO };
    await chamar(usuario, sql`select public.reabrir_lead(${leadId}::uuid)`);
    revalidar(leadId);
    return { ok: true, mensagem: 'Lead reaberto.' };
  });
}

// ---------------------------------------------------------------------------
// Visitas
// ---------------------------------------------------------------------------
export async function agendarVisita(
  leadId: string,
  entrada: VisitaEntrada,
): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(leadId)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(visitaSchema, entrada);
    if (!v.ok) return v.resultado;
    const quando = instante(usuario, v.dados.quando);
    if (!quando) return DATA_INVALIDA;
    await chamar(
      usuario,
      sql`select public.agendar_visita(${leadId}::uuid, ${quando.toISOString()}::timestamptz,
        ${v.dados.observacoes || null})`,
    );
    revalidar(leadId);
    return { ok: true, mensagem: 'Visita agendada.' };
  });
}

export async function confirmarVisita(
  visitaId: string,
  leadId: string,
  entrada: VisitaEntrada,
  remarcar = false,
): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(visitaId)) return { ok: false, erro: NAO_ENCONTRADO };
    const v = validar(visitaSchema, entrada);
    if (!v.ok) return v.resultado;
    const quando = instante(usuario, v.dados.quando);
    if (!quando) return DATA_INVALIDA;
    await chamar(
      usuario,
      remarcar
        ? sql`select public.remarcar_visita(${visitaId}::uuid, ${quando.toISOString()}::timestamptz)`
        : sql`select public.confirmar_visita(${visitaId}::uuid, ${quando.toISOString()}::timestamptz)`,
    );
    revalidar(leadId);
    return { ok: true, mensagem: remarcar ? 'Visita remarcada.' : 'Visita confirmada.' };
  });
}

export async function cancelarVisita(
  visitaId: string,
  leadId: string,
  motivo: string,
): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(visitaId)) return { ok: false, erro: NAO_ENCONTRADO };
    await chamar(
      usuario,
      sql`select public.cancelar_visita(${visitaId}::uuid, ${motivo.trim().slice(0, 300) || null})`,
    );
    revalidar(leadId);
    return { ok: true, mensagem: 'Visita cancelada.' };
  });
}

export async function marcarVisitaRealizada(
  visitaId: string,
  leadId: string,
): Promise<ResultadoAcao> {
  return acaoDoLead(async (usuario) => {
    if (!idValido(visitaId)) return { ok: false, erro: NAO_ENCONTRADO };
    await chamar(usuario, sql`select public.marcar_visita_realizada(${visitaId}::uuid)`);
    revalidar(leadId);
    return { ok: true, mensagem: 'Visita marcada como realizada.' };
  });
}

// ---------------------------------------------------------------------------
// Mensagem pronta (o vendedor vê, edita e abre o WhatsApp; nada é enviado sozinho)
// ---------------------------------------------------------------------------
export type MensagemPronta = {
  situacao: SituacaoMensagem;
  texto: string;
  /** wa.me do cliente, sem texto (o texto editado entra na hora de abrir) */
  numero: string;
};

export async function prepararMensagem(
  leadId: string,
  situacao?: SituacaoMensagem,
): Promise<ResultadoAcao<MensagemPronta>> {
  return acaoDoLead<MensagemPronta>(async (usuario) => {
    if (!idValido(leadId)) return { ok: false, erro: NAO_ENCONTRADO };
    const d = await dadosDaMensagem(usuario, leadId);
    if (!d) return { ok: false, erro: NAO_ENCONTRADO };
    const escolhida =
      situacao && (SITUACOES_MENSAGEM as readonly string[]).includes(situacao) ? situacao : situacaoDoMomento(d.momento);
    return {
      ok: true,
      mensagem: '',
      dados: {
        situacao: escolhida,
        texto: montarMensagem(escolhida, d.dados),
        numero: linkWhatsApp(d.whatsappE164),
      },
    };
  });
}

/** Registra na linha do tempo que o WhatsApp foi aberto com a mensagem. */
export async function registrarMensagem(
  leadId: string,
  situacao: SituacaoMensagem,
  tarefaId?: string | null,
): Promise<void> {
  await acaoDoLead(async (usuario) => {
    if (!idValido(leadId) || !(SITUACOES_MENSAGEM as readonly string[]).includes(situacao)) {
      return { ok: false, erro: NAO_ENCONTRADO };
    }
    await chamar(
      usuario,
      sql`select public.registrar_mensagem(${leadId}::uuid, ${situacao},
        ${tarefaId && idValido(tarefaId) ? tarefaId : null}::uuid)`,
    );
    revalidar(leadId);
    return { ok: true, mensagem: '' };
  });
}
