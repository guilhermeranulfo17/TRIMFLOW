'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { CANAIS_EXTERNOS, TIPOS_CONFIGURAVEIS } from '@/domain/avisos/canais';
import { horaValida } from '@/domain/avisos/silencio';
import { prazoValido, REGRAS_FOLLOW_UP } from '@/domain/follow-up/regras';
import { celularBRParaE164 } from '@/domain/phone';
import type { ResultadoAcao } from '@/server/actions/empresa/comum';
import { exigirPerfil } from '@/server/auth/guards';
import { exigirSessao, type UsuarioAtual } from '@/server/auth/sessao';
import { listarAvisos, type AvisoVista } from '@/server/avisos/carregar';
import { processarAvisos } from '@/server/avisos/processar';
import { comUsuario } from '@/server/db/tenant';
import { mensagemErroConta } from '@/domain/cobranca/limites';
import { logar } from '@/server/log';

const MENSAGENS: Record<string, string> = {
  AVISO_SEM_PERMISSAO: 'Sua sessão expirou. Entre de novo.',
  AVISO_PREFERENCIA_INVALIDA: 'Confira as preferências.',
  AVISO_PUSH_INVALIDO: 'Este navegador não entregou uma inscrição válida. Tente de novo.',
  AVISO_WHATSAPP_SEM_ACEITE: 'Para receber pelo WhatsApp, marque que aceita receber os avisos.',
  AVISO_WHATSAPP_NUMERO: 'Informe um celular com DDD.',
  AVISO_SO_DONO: 'Só o dono altera as regras de follow-up.',
  FOLLOW_UP_PRAZO_INVALIDO: 'Escolha um prazo dentro dos limites.',
};
const PADRAO = 'Não foi possível salvar agora. Tente de novo em instantes.';

async function acao<T>(
  fn: (u: UsuarioAtual) => Promise<ResultadoAcao<T>>,
  u?: () => Promise<UsuarioAtual>,
): Promise<ResultadoAcao<T>> {
  try {
    return await fn(await (u ?? exigirSessao)());
  } catch (erro) {
    unstable_rethrow(erro);
    const e = (erro as { cause?: unknown })?.cause ?? erro;
    const codigo = (e as { message?: string } | null)?.message ?? '';
    const mensagem = MENSAGENS[codigo] ?? mensagemErroConta(codigo) ?? PADRAO;
    if (mensagem === PADRAO) logar('erro', 'avisos.erro_inesperado');
    return { ok: false, erro: mensagem };
  }
}

const uuid = z.string().uuid();

export async function listarAvisosSino(): Promise<ResultadoAcao<AvisoVista[]>> {
  return acao(async (u) => ({
    ok: true,
    mensagem: '',
    dados: await listarAvisos(u, { limite: 20, dias: 30 }),
  }));
}

export async function marcarAvisosLidos(ids: string[] | null): Promise<ResultadoAcao> {
  return acao(async (u) => {
    const lista = ids === null ? null : z.array(uuid).max(200).parse(ids);
    await comUsuario(u.id, (tx) =>
      lista === null
        ? tx.execute(sql`select public.marcar_avisos_lidos(null)`)
        : tx.execute(sql`select public.marcar_avisos_lidos(
            array(select jsonb_array_elements_text(${JSON.stringify(lista)}::jsonb))::uuid[])`),
    );
    revalidatePath('/app', 'layout');
    return { ok: true, mensagem: '' };
  });
}

const preferenciasSchema = z.object({
  canais: z.record(z.enum(TIPOS_CONFIGURAVEIS), z.array(z.enum(CANAIS_EXTERNOS)).max(2)),
  silencioInicio: z.string().refine(horaValida, 'Hora inválida.'),
  silencioFim: z.string().refine(horaValida, 'Hora inválida.'),
  receberDeVendedores: z.boolean(),
});

export async function salvarPreferenciasAvisos(
  entrada: z.input<typeof preferenciasSchema>,
): Promise<ResultadoAcao> {
  return acao(async (u) => {
    const p = preferenciasSchema.safeParse(entrada);
    if (!p.success) return { ok: false, erro: 'Confira as preferências.' };
    await comUsuario(u.id, (tx) =>
      tx.execute(sql`select public.salvar_preferencias_avisos(${JSON.stringify(p.data.canais)}::jsonb,
        ${p.data.silencioInicio}::time, ${p.data.silencioFim}::time, ${p.data.receberDeVendedores})`),
    );
    revalidatePath('/app/conta/avisos');
    return { ok: true, mensagem: 'Preferências salvas.' };
  });
}

const inscricaoSchema = z.object({
  endpoint: z.string().url().startsWith('https://').max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  aparelho: z.string().max(80).optional(),
});

export async function inscreverPush(
  entrada: z.input<typeof inscricaoSchema>,
): Promise<ResultadoAcao> {
  return acao(async (u) => {
    const i = inscricaoSchema.safeParse(entrada);
    if (!i.success) return { ok: false, erro: MENSAGENS.AVISO_PUSH_INVALIDO! };
    await comUsuario(u.id, (tx) =>
      tx.execute(sql`select public.inscrever_push(${i.data.endpoint}, ${i.data.keys.p256dh},
        ${i.data.keys.auth}, ${i.data.aparelho ?? null})`),
    );
    revalidatePath('/app/conta/avisos');
    return { ok: true, mensagem: 'Avisos ligados neste aparelho.' };
  });
}

export async function removerPush(endpoint: string): Promise<ResultadoAcao> {
  return acao(async (u) => {
    await comUsuario(u.id, (tx) =>
      tx.execute(sql`select public.remover_push(${endpoint.slice(0, 1000)})`),
    );
    revalidatePath('/app/conta/avisos');
    return { ok: true, mensagem: 'Aparelho removido.' };
  });
}

export async function ativarWhatsapp(numero: string, aceite: boolean): Promise<ResultadoAcao> {
  return acao(async (u) => {
    const e164 = celularBRParaE164(numero);
    if (!e164)
      return {
        ok: false,
        erro: MENSAGENS.AVISO_WHATSAPP_NUMERO!,
        campos: { numero: MENSAGENS.AVISO_WHATSAPP_NUMERO! },
      };
    await comUsuario(u.id, (tx) =>
      tx.execute(sql`select public.ativar_whatsapp(${e164}, ${aceite})`),
    );
    revalidatePath('/app/conta/avisos');
    return { ok: true, mensagem: 'WhatsApp ligado para os avisos.' };
  });
}

export async function desativarWhatsapp(): Promise<ResultadoAcao> {
  return acao(async (u) => {
    await comUsuario(u.id, (tx) => tx.execute(sql`select public.desativar_whatsapp()`));
    revalidatePath('/app/conta/avisos');
    return { ok: true, mensagem: 'WhatsApp desligado para os avisos.' };
  });
}

export type ResultadoTeste = {
  canal: 'painel' | 'push' | 'whatsapp';
  status: string;
  erro: string | null;
}[];

/** Cria o aviso de teste, processa a fila na hora e devolve o resultado de cada canal. */
export async function enviarAvisoTeste(): Promise<ResultadoAcao<ResultadoTeste>> {
  return acao(async (u) => {
    const [linha] = await comUsuario(u.id, (tx) =>
      tx.execute<{ id: string }>(sql`select public.criar_aviso_teste() as id`),
    );
    const id = linha!.id;
    await processarAvisos({ lotes: 1 });
    const entregas = await comUsuario(u.id, (tx) =>
      tx.execute<{ canal: 'push' | 'whatsapp'; status: string; erro_codigo: string | null }>(
        sql`select canal, status, erro_codigo from public.avisos_entregas where aviso_id = ${id}`,
      ),
    );
    const resultado: ResultadoTeste = [{ canal: 'painel', status: 'enviado', erro: null }];
    for (const canal of ['push', 'whatsapp'] as const) {
      const e = entregas.find((x) => x.canal === canal);
      resultado.push(
        e
          ? { canal, status: e.status, erro: e.erro_codigo }
          : { canal, status: 'desligado', erro: null },
      );
    }
    revalidatePath('/app', 'layout');
    return { ok: true, mensagem: 'Aviso de teste enviado.', dados: resultado };
  });
}

const regraSchema = z.object({
  regra: z.enum(REGRAS_FOLLOW_UP),
  ligada: z.boolean(),
  prazo: z.number().int().nullable(),
});

export async function salvarRegraFollowUp(
  entrada: z.input<typeof regraSchema>,
): Promise<ResultadoAcao> {
  return acao(
    async (u) => {
      const r = regraSchema.safeParse(entrada);
      if (!r.success || !prazoValido(r.data.regra, r.data.prazo)) {
        return { ok: false, erro: MENSAGENS.FOLLOW_UP_PRAZO_INVALIDO! };
      }
      await comUsuario(u.id, (tx) =>
        tx.execute(
          sql`select public.salvar_regra_follow_up(${r.data.regra}, ${r.data.ligada}, ${r.data.prazo})`,
        ),
      );
      revalidatePath('/app/empresa/follow-up');
      return { ok: true, mensagem: r.data.ligada ? 'Regra salva.' : 'Regra desligada.' };
    },
    () => exigirPerfil('dono'),
  );
}
