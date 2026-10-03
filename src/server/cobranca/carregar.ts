import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { cache } from 'react';
import { codigoPlanoVigente, type RecursosPlano } from '@/domain/cobranca/limites';
import { suspensaoPrevista, type Situacao } from '@/domain/cobranca/situacao';
import { hojeNoFuso } from '@/domain/dates';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { obterDb } from '@/server/db/client';
import {
  acessosSuporte,
  assinaturas,
  cobrancas,
  empresas,
  empresasCobranca,
  planos,
  type Assinatura,
} from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { cobrancaDisponivel } from './config';

/*
 * Leituras da cobrança. A tela de Plano lê como o dono (RLS: assinaturas, cobranças e dados de
 * cobrança só para o dono). Recursos do plano (limites) servem também ao vendedor (Números):
 * por isso vêm da conexão administrativa, expondo só o plano vigente.
 */

export type PlanoTela = RecursosPlano & {
  precoMensalCentavos: number;
  precoAnualCentavos: number;
};

const paraRecursos = (p: typeof planos.$inferSelect): PlanoTela => ({
  codigo: p.codigo,
  nome: p.nome,
  maxUsuarios: p.maxUsuarios,
  maxEspacos: p.maxEspacos,
  whatsappAvisos: p.whatsappAvisos,
  followUp: p.followUp,
  numerosCompleto: p.numerosCompleto,
  precoMensalCentavos: p.precoMensalCentavos,
  precoAnualCentavos: p.precoAnualCentavos,
});

/** Espelho em TS de public._assinatura_referencia (qual assinatura decide a situação). */
export function assinaturaDeReferencia(lista: Assinatura[], hoje: string): Assinatura | null {
  const peso = (a: Assinatura) =>
    a.status === 'ativa'
      ? 3
      : a.status === 'cancelada' && a.pagoAte && a.pagoAte >= hoje
        ? 2
        : a.status === 'pendente'
          ? 1
          : 0;
  return (
    [...lista].sort(
      (x, y) => peso(y) - peso(x) || y.criadaEm.getTime() - x.criadaEm.getTime(),
    )[0] ?? null
  );
}

/** Plano vigente da empresa (limites e recursos), para qualquer perfil. Memo por requisição. */
export const recursosDaEmpresa = cache(async (empresaId: string): Promise<RecursosPlano> => {
  const [l] = await obterDb().execute<{ p: Record<string, unknown> }>(
    sql`select row_to_json(public._plano_vigente(${empresaId})) as p`,
  );
  const p = l?.p ?? {};
  return {
    codigo: String(p.codigo ?? 'essencial'),
    nome: String(p.nome ?? 'Essencial'),
    maxUsuarios: Number(p.max_usuarios ?? 2),
    maxEspacos: p.max_espacos == null ? null : Number(p.max_espacos),
    whatsappAvisos: Boolean(p.whatsapp_avisos),
    followUp: Boolean(p.follow_up),
    numerosCompleto: Boolean(p.numeros_completo),
  };
});

/** Usuários ativos da empresa (conferência do limite antes de criar no Auth). */
export async function usuariosAtivos(empresaId: string): Promise<number> {
  const [l] = await obterDb().execute<{ n: number }>(
    sql`select count(*)::int as n from public.usuarios where empresa_id = ${empresaId} and ativo`,
  );
  return l?.n ?? 0;
}

export type FaixaContaDados = {
  situacao: Situacao;
  trialAte: Date | null;
  suspendeEm: string | null;
  pagoAte: string | null;
};

/** Dados da faixa global (só o dono vê a faixa; leitura via RLS do dono). */
export const carregarFaixaConta = cache(
  async (usuario: UsuarioAtual): Promise<FaixaContaDados | null> => {
    if (usuario.perfil !== 'dono') return null;
    return comUsuario(usuario.id, async (tx) => {
      const [e] = await tx
        .select({ plano: empresas.plano, trialAte: empresas.trialAte, fuso: empresas.fuso })
        .from(empresas)
        .where(eq(empresas.id, usuario.empresa.id));
      if (!e) return null;
      let suspendeEm: string | null = null;
      let pagoAte: string | null = null;
      if (e.plano === 'inadimplente' || e.plano === 'cancelado') {
        const lista = await tx.select().from(assinaturas);
        const a = assinaturaDeReferencia(lista, hojeNoFuso(e.fuso));
        suspendeEm = suspensaoPrevista(a);
        pagoAte = a?.pagoAte ?? null;
      }
      return { situacao: e.plano, trialAte: e.trialAte, suspendeEm, pagoAte };
    });
  },
);

export type FaturaTela = {
  id: string;
  tipo: 'assinatura' | 'implantacao';
  valorCentavos: number;
  vencimento: string;
  status: string;
  link: string | null;
  pagoEm: Date | null;
};

export type TelaPlano = {
  cobrancaDisponivel: boolean;
  situacao: Situacao;
  trialAte: Date | null;
  isenta: boolean;
  fuso: string;
  planos: PlanoTela[];
  vigente: PlanoTela;
  assinatura: Assinatura | null;
  /** assinatura não cancelada (para Mudar de plano / Cancelar) */
  assinaturaAberta: Assinatura | null;
  suspendeEm: string | null;
  faturas: FaturaTela[];
  dadosCobranca: { nome: string; documento: string; email: string } | null;
  suporteAte: Date | null;
};

export async function carregarTelaPlano(dono: UsuarioAtual): Promise<TelaPlano> {
  return comUsuario(dono.id, async (tx) => {
    const [e] = await tx
      .select({
        plano: empresas.plano,
        trialAte: empresas.trialAte,
        isenta: empresas.isenta,
        fuso: empresas.fuso,
      })
      .from(empresas)
      .where(eq(empresas.id, dono.empresa.id));
    const listaPlanos = (await tx.select().from(planos).orderBy(planos.ordem)).filter(
      (p) => p.ativo,
    );
    const lista = await tx.select().from(assinaturas).orderBy(desc(assinaturas.criadaEm));
    const hoje = hojeNoFuso(e!.fuso);
    const ref = assinaturaDeReferencia(lista, hoje);
    const aberta = lista.find((a) => a.status !== 'cancelada') ?? null;
    const faturas = await tx
      .select({
        id: cobrancas.id,
        tipo: cobrancas.tipo,
        valorCentavos: cobrancas.valorCentavos,
        vencimento: cobrancas.vencimento,
        status: cobrancas.status,
        link: cobrancas.linkFatura,
        pagoEm: cobrancas.pagoEm,
      })
      .from(cobrancas)
      .orderBy(desc(cobrancas.vencimento))
      .limit(24);
    const [dados] = await tx
      .select({
        nome: empresasCobranca.nome,
        documento: empresasCobranca.documento,
        email: empresasCobranca.email,
      })
      .from(empresasCobranca);
    const [suporte] = await tx
      .select({ ate: sql<Date | null>`max(${acessosSuporte.expiraEm})` })
      .from(acessosSuporte)
      .where(sql`${acessosSuporte.revogadoEm} is null and ${acessosSuporte.expiraEm} > now()`);
    const telas = listaPlanos.map(paraRecursos);
    const codigo = codigoPlanoVigente({
      situacao: e!.plano,
      isenta: e!.isenta,
      planoAssinatura: ref?.planoCodigo ?? null,
    });
    return {
      cobrancaDisponivel: cobrancaDisponivel(),
      situacao: e!.plano,
      trialAte: e!.trialAte,
      isenta: e!.isenta,
      fuso: e!.fuso,
      planos: telas,
      vigente: telas.find((p) => p.codigo === codigo) ?? telas[0]!,
      assinatura: ref,
      assinaturaAberta: aberta,
      suspendeEm: suspensaoPrevista(ref),
      faturas,
      dadosCobranca: dados ?? null,
      suporteAte: suporte?.ate ? new Date(suporte.ate) : null,
    };
  });
}
