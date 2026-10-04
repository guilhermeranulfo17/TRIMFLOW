'use server';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath, revalidateTag } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { modeloDoSegmento } from '@/domain/modelos';
import { validarFaixas, validarPreco } from '@/domain/onboarding/precos';
import type { ResultadoAcao } from '@/server/actions/empresa/comum';
import { exigirPerfil } from '@/server/auth/guards';
import { exigirSessao, type UsuarioAtual } from '@/server/auth/sessao';
import { gravarModelo } from '@/server/catalogo/gravar-modelo';
import { empresas } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { tagDoBuffet } from '@/server/publico/cache';
import { mensagemErroConta } from '@/domain/cobranca/limites';
import { logar } from '@/server/log';

/*
 * Onboarding guiado (/app/comecar) e itens manuais do checklist. Escrita só pelas funções SQL
 * (avancar_onboarding, confirmar_precos, marcar_link_na_bio, dispensar_checklist), que auditam.
 */

const MENSAGENS: Record<string, string> = {
  ONBOARDING_SO_DONO: 'Só o dono configura o link.',
  ONBOARDING_PASSO_INVALIDO: 'Passo inválido. Recarregue a página.',
  ONBOARDING_SEM_PRECO: 'Confirme o preço de pelo menos um pacote para continuar.',
  PRECO_INVALIDO: 'Confira os preços digitados.',
  PACOTE_NAO_ENCONTRADO: 'Um pacote não foi encontrado. Recarregue a página.',
  OPCIONAL_NAO_ENCONTRADO: 'Um opcional não foi encontrado. Recarregue a página.',
};
const PADRAO = 'Não foi possível salvar agora. Tente de novo em instantes.';

async function acao<T>(
  fn: (u: UsuarioAtual) => Promise<ResultadoAcao<T>>,
  usuario: () => Promise<UsuarioAtual> = () => exigirPerfil('dono'),
): Promise<ResultadoAcao<T>> {
  try {
    return await fn(await usuario());
  } catch (erro) {
    unstable_rethrow(erro);
    const e = (erro as { cause?: unknown })?.cause ?? erro;
    const codigo = (e as { message?: string } | null)?.message ?? '';
    const mensagem = MENSAGENS[codigo] ?? mensagemErroConta(codigo) ?? PADRAO;
    if (mensagem === PADRAO) logar('erro', 'onboarding.erro_inesperado');
    return { ok: false, erro: mensagem };
  }
}

const passoSchema = z.number().int().min(1).max(5);

/** Vai para um passo (salvo no servidor). */
export async function irParaPasso(passo: number): Promise<ResultadoAcao> {
  return acao(async (u) => {
    const p = passoSchema.safeParse(passo);
    if (!p.success) return { ok: false, erro: MENSAGENS.ONBOARDING_PASSO_INVALIDO! };
    await comUsuario(u.id, (tx) =>
      tx.execute(sql`select public.avancar_onboarding(${p.data}::smallint)`),
    );
    revalidatePath('/app', 'layout');
    return { ok: true, mensagem: '' };
  });
}

/** Conta antiga ou cadastro com confirmação de e-mail: carrega o modelo agora (idempotente). */
export async function carregarModeloDoOnboarding(): Promise<ResultadoAcao> {
  return acao(async (u) => {
    const [empresa] = await comUsuario(u.id, (tx) =>
      tx
        .select({ segmento: empresas.segmento })
        .from(empresas)
        .where(eq(empresas.id, u.empresa.id)),
    );
    if (empresa) {
      await gravarModelo(comUsuario, u.id, u.empresa.id, modeloDoSegmento(empresa.segmento));
    }
    revalidatePath('/app', 'layout');
    return { ok: true, mensagem: 'Catálogo de exemplo carregado.' };
  });
}

const centavos = z.number().int();
const precosSchema = z.object({
  pacotes: z
    .array(
      z.object({
        id: z.uuid(),
        precoPessoaCentavos: centavos.optional(),
        valorExcedenteCentavos: centavos.optional(),
        faixas: z
          .array(z.object({ ateConvidados: z.number().int().min(1), valorCentavos: centavos }))
          .max(30)
          .optional(),
      }),
    )
    .max(50),
  opcionais: z.array(z.object({ id: z.uuid(), precoCentavos: centavos })).max(100),
});
export type PrecosEntrada = z.input<typeof precosSchema>;

/** Passo 3: grava e confirma os preços digitados (só o que o dono preencheu). */
export async function confirmarPrecos(
  entrada: PrecosEntrada,
): Promise<ResultadoAcao<{ n: number }>> {
  return acao(async (u) => {
    const v = precosSchema.safeParse(entrada);
    if (!v.success) return { ok: false, erro: MENSAGENS.PRECO_INVALIDO! };
    for (const p of v.data.pacotes) {
      const erro = p.faixas
        ? (validarFaixas(p.faixas) ??
          (p.valorExcedenteCentavos === undefined ? 'OBRIGATORIO' : null))
        : validarPreco(p.precoPessoaCentavos ?? null);
      if (erro) return { ok: false, erro: MENSAGENS.PRECO_INVALIDO! };
    }
    if (v.data.opcionais.some((o) => o.precoCentavos < 0 || o.precoCentavos > 100_000_000)) {
      return { ok: false, erro: MENSAGENS.PRECO_INVALIDO! };
    }
    const json = {
      pacotes: v.data.pacotes.map((p) => ({
        id: p.id,
        preco_pessoa_centavos: p.precoPessoaCentavos,
        valor_excedente_centavos: p.valorExcedenteCentavos,
        faixas: p.faixas?.map((f) => ({
          ate_convidados: f.ateConvidados,
          valor_centavos: f.valorCentavos,
        })),
      })),
      opcionais: v.data.opcionais.map((o) => ({ id: o.id, preco_centavos: o.precoCentavos })),
    };
    const [r] = await comUsuario(u.id, (tx) =>
      tx.execute<{ n: number }>(
        sql`select public.confirmar_precos(${JSON.stringify(json)}::jsonb) as n`,
      ),
    );
    revalidateTag(tagDoBuffet(u.empresa.slug));
    revalidatePath('/app', 'layout');
    return { ok: true, mensagem: 'Preços confirmados.', dados: { n: r?.n ?? 0 } };
  });
}

/** Checklist: "coloquei o link na bio" (ou desfazer). */
export async function marcarLinkNaBio(feito: boolean): Promise<ResultadoAcao> {
  return acao(async (u) => {
    await comUsuario(u.id, (tx) =>
      tx.execute(sql`select public.marcar_link_na_bio(${feito === true})`),
    );
    revalidatePath('/app', 'layout');
    return { ok: true, mensagem: feito ? 'Marcado como feito.' : 'Desmarcado.' };
  });
}

/** Dispensar (ou mostrar de novo) o checklist, só para quem está logado. */
export async function dispensarChecklist(dispensar: boolean): Promise<ResultadoAcao> {
  return acao(
    async (u) => {
      await comUsuario(u.id, (tx) =>
        tx.execute(sql`select public.dispensar_checklist(${dispensar === true})`),
      );
      revalidatePath('/app', 'layout');
      return {
        ok: true,
        mensagem: dispensar
          ? 'Checklist escondido. Você pode reativar em Minha conta.'
          : 'Checklist de volta.',
      };
    },
    () => exigirSessao(),
  );
}
