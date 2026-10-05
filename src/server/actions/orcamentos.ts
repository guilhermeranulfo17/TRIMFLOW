'use server';

import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { traduzirErroAgenda } from '@/domain/agenda';
import { mensagemErroConta } from '@/domain/cobranca/limites';
import { celularBRParaE164 } from '@/domain/phone';
import { montarPrevia, type Previa } from '@/domain/publico';
import { linkWhatsApp, mensagemEnvioProposta } from '@/domain/publico/whatsapp';
import {
  orcamentoInternoSchema,
  previaInternaSchema,
  type OrcamentoInterno,
  type OrcamentoInternoEntrada,
  type PreviaInternaEntrada,
} from '@/domain/validacao/orcamento-interno';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarDisponibilidade } from '@/server/agenda/carregar';
import { comUsuario } from '@/server/db/tenant';
import { siteUrl } from '@/server/env';
import {
  buscarLeadPorWhatsapp,
  carregarBaseInterna,
  type BaseInterna,
} from '@/server/orcamentos/carregar';
import { prepararVersao } from '@/server/proposta/versao';
import { logar } from '@/server/log';

/*
 * Orçamento interno (dono e vendedor). Mesmo motor do link, canal interno: desconto até o limite
 * do usuário (vindo do banco; o banco confere de novo), itens avulsos e observações. O preço
 * nunca vem do navegador.
 */

export type ResultadoInterno<T = undefined> =
  { ok: true; dados: T } | { ok: false; erro: string; campos?: Record<string, string> };

const MENSAGENS: Record<string, string> = {
  ORCAMENTO_DESCONTO_ACIMA_LIMITE: 'O desconto passa do seu limite. Peça ao dono do buffet.',
  ORCAMENTO_VERSAO_ANTIGA: 'Este orçamento ganhou uma versão mais nova. Abra a versão atual.',
  ORCAMENTO_RESERVA_CONFIRMADA:
    'Esta data já tem reserva confirmada. Para mudar data, horário ou espaço, cancele a reserva na Agenda antes.',
  ORCAMENTO_NAO_ENCONTRADO: 'Orçamento não encontrado.',
  ORCAMENTO_DADOS_INVALIDOS: 'Confira os dados do orçamento.',
  ORCAMENTO_ESTADO_INVALIDO: 'Este orçamento não pode ser pré-reservado agora.',
  ORCAMENTO_EXPIRADO: 'Esta proposta venceu. Crie uma nova versão com os preços de hoje.',
  ORCAMENTO_ANTECEDENCIA:
    'A data está dentro da antecedência mínima. Marque "Ciente da antecedência" e salve de novo.',
  ORCAMENTO_TESTE: 'Orçamento de teste não pode ser pré-reservado.',
  PUBLICO_DADOS_INVALIDOS: 'Confira os dados do orçamento.',
};

function camposDoZod(erro: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const issue of erro.issues) campos[issue.path.join('.')] ??= issue.message;
  return campos;
}

function mensagemDoErro(erro: unknown): string {
  const e = erro as { message?: string; cause?: { message?: string } } | null;
  const codigo = e?.cause?.message ?? e?.message ?? '';
  return (
    MENSAGENS[codigo] ??
    mensagemErroConta(codigo) ??
    traduzirErroAgenda(codigo) ??
    'Não foi possível salvar agora. Tente de novo.'
  );
}

async function acao<T>(
  fn: () => Promise<ResultadoInterno<T>>,
  onde: string,
): Promise<ResultadoInterno<T>> {
  try {
    return await fn();
  } catch (erro) {
    unstable_rethrow(erro);
    const msg = mensagemDoErro(erro);
    if (msg.startsWith('Não foi possível')) logar('erro', `orcamento.${onde}`);
    return { ok: false, erro: msg };
  }
}

function calcular(base: BaseInterna, o: Pick<OrcamentoInterno, 'escolhas' | 'ajustes'>): Previa {
  const a = o.ajustes;
  return montarPrevia(base.ctx, o.escolhas, {
    hoje: base.hoje,
    comContato: true,
    modo: 'exato',
    extra: {
      canal: 'interno',
      itensAvulsos: a.avulsos.length ? a.avulsos : undefined,
      desconto: a.desconto ?? undefined,
      limiteDescontoBp: base.limiteDescontoBp,
    },
  });
}

export type PreviaInterna = Previa & { limiteDescontoBp: number };

/** Recalcula a cada mudança (servidor). */
export async function previaInterna(
  entrada: PreviaInternaEntrada,
): Promise<ResultadoInterno<PreviaInterna>> {
  return acao(async () => {
    const usuario = await exigirSessao();
    const r = previaInternaSchema.safeParse(entrada);
    // Nunca a mensagem genérica: devolve os campos e a tela destaca cada um.
    if (!r.success) return { ok: false, erro: '', campos: camposDoZod(r.error) };
    const base = await carregarBaseInterna(usuario);
    if (!base) return { ok: false, erro: 'Não foi possível carregar seu catálogo.' };
    return {
      ok: true,
      dados: { ...calcular(base, r.data), limiteDescontoBp: base.limiteDescontoBp },
    };
  }, 'previa');
}

export type OrcamentoSalvo = {
  id: string;
  numero: number;
  versao: number;
  leadId: string;
  link: string;
  linkWhatsapp: string;
  pdf: string;
};

export async function salvarOrcamentoInterno(
  entrada: OrcamentoInternoEntrada,
): Promise<ResultadoInterno<OrcamentoSalvo>> {
  return acao(async () => {
    const usuario = await exigirSessao();
    const r = orcamentoInternoSchema.safeParse(entrada);
    if (!r.success) {
      return { ok: false, erro: 'Confira os campos destacados.', campos: camposDoZod(r.error) };
    }
    const o = r.data;
    const whatsapp = celularBRParaE164(o.cliente.whatsapp);
    if (!whatsapp && !o.orcamentoId) {
      return {
        ok: false,
        erro: 'Confira os campos destacados.',
        campos: { 'cliente.whatsapp': 'Informe um celular com DDD, ex.: (34) 99135-5450.' },
      };
    }
    const base = await carregarBaseInterna(usuario);
    if (!base) return { ok: false, erro: 'Não foi possível carregar seu catálogo.' };
    const previa = calcular(base, o);
    if (!previa.resultado)
      return { ok: false, erro: 'Escolha a festa, a data, o horário e o pacote.' };
    if (!previa.resultado.ok) return { ok: false, erro: previa.resultado.erros[0]!.mensagem };
    const foraAntecedencia = previa.resultado.avisos.some(
      (a) => a.codigo === 'ANTECEDENCIA_MINIMA',
    );
    if (foraAntecedencia && !o.ajustes.foraAntecedencia) {
      return {
        ok: false,
        erro: 'A data está dentro da antecedência mínima. Marque "Ciente da antecedência" para salvar.',
        campos: { 'ajustes.foraAntecedencia': 'Confirme que está ciente.' },
      };
    }
    const v = prepararVersao({
      ctx: base.ctx,
      escolhas: o.escolhas,
      resultado: previa.resultado,
      hoje: base.hoje,
      textos: base.textos,
      aberturaModelo: base.aberturaPorTipo[o.escolhas.tipoEventoId ?? ''] ?? null,
      clienteNome: o.cliente.nome,
      buffetNome: usuario.empresa.nome,
    });
    const rascunho = { ...o.escolhas, interno: o.ajustes };
    const [salvo] = await comUsuario(usuario.id, (tx) =>
      tx.execute<{ id: string; token: string; numero: number; versao: number; lead_id: string }>(
        sql`select * from public.salvar_orcamento_interno(
          ${o.orcamentoId ?? null}::uuid, ${whatsapp}, ${o.cliente.nome},
          ${o.cliente.origem}::public.origem_lead, ${JSON.stringify(v.resultado)}::jsonb,
          ${JSON.stringify(v.itens)}::jsonb, ${v.resultado.totalCentavos}, ${v.validade}::date,
          ${JSON.stringify(rascunho)}::jsonb, ${v.campos.tipoEventoId}, ${v.campos.data}::date,
          ${v.campos.turnoId}, ${v.campos.espacoId}, ${v.campos.convidados}, ${v.campos.pacoteId},
          ${JSON.stringify(v.conteudo)}::jsonb, ${o.ajustes.observacoes || null},
          ${o.ajustes.observacoesInternas || null}, ${o.ajustes.descontoMotivo || null},
          ${foraAntecedencia && o.ajustes.foraAntecedencia})`,
      ),
    );
    revalidatePath('/app/leads');
    const link = `${siteUrl()}/b/${usuario.empresa.slug}/proposta/${salvo!.token}`;
    return {
      ok: true,
      dados: {
        id: salvo!.id,
        numero: salvo!.numero,
        versao: salvo!.versao,
        leadId: salvo!.lead_id,
        link,
        linkWhatsapp: whatsapp
          ? linkWhatsApp(
              whatsapp,
              mensagemEnvioProposta(usuario.empresa.nome, o.cliente.nome, link),
            )
          : '',
        pdf: `/app/orcamentos/${salvo!.id}/pdf`,
      },
    };
  }, 'salvar');
}

/** Pré-reserva a partir do orçamento (vai para a Agenda com origem "orçamento"). */
export async function preReservarOrcamento(
  id: string,
): Promise<ResultadoInterno<{ expiraEm: string }>> {
  return acao(async () => {
    const usuario = await exigirSessao();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, erro: 'Orçamento não encontrado.' };
    const [r] = await comUsuario(usuario.id, (tx) =>
      tx.execute<{ expira: string }>(
        sql`select public.pre_reservar_orcamento(${id})::text as expira`,
      ),
    );
    revalidatePath('/app/agenda');
    revalidatePath('/app/leads');
    return { ok: true, dados: { expiraEm: r!.expira } };
  }, 'pre-reserva');
}

/** "Proposta enviada" (WhatsApp, link copiado ou PDF baixado) na linha do tempo do lead. */
export async function marcarOrcamentoEnviado(
  id: string,
  canal: 'whatsapp' | 'link' | 'pdf',
): Promise<void> {
  try {
    const usuario = await exigirSessao();
    if (!/^[0-9a-f-]{36}$/i.test(id) || !['whatsapp', 'link', 'pdf'].includes(canal)) return;
    await comUsuario(usuario.id, (tx) =>
      tx.execute(sql`select public.marcar_orcamento_enviado(${id}, ${canal})`),
    );
  } catch (erro) {
    unstable_rethrow(erro);
  }
}

/** Ao digitar o WhatsApp: este número já é lead? */
export async function procurarCliente(
  whatsapp: string,
): Promise<ResultadoInterno<{ id: string; nome: string; orcamentos: number } | null>> {
  return acao(async () => {
    const usuario = await exigirSessao();
    const e164 = celularBRParaE164(whatsapp);
    if (!e164) return { ok: true, dados: null };
    return { ok: true, dados: await buscarLeadPorWhatsapp(usuario, e164) };
  }, 'cliente');
}

export type SlotNoMes = { data: string; turnoId: string; espacoId: string; livre: boolean };

/** Estado da agenda no mês (mesma leitura da Agenda), para o calendário do orçamento. */
export async function agendaDoMes(mes: string): Promise<ResultadoInterno<SlotNoMes[]>> {
  return acao(async () => {
    const usuario = await exigirSessao();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: true, dados: [] };
    const [ano, m] = mes.split('-').map(Number) as [number, number];
    const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
    const slots = await carregarDisponibilidade(usuario, `${mes}-01`, `${mes}-${ultimo}`);
    return {
      ok: true,
      dados: slots.map((s) => ({
        data: s.data,
        turnoId: s.turnoId,
        espacoId: s.espacoId,
        livre: s.estado === 'livre',
      })),
    };
  }, 'agenda');
}
