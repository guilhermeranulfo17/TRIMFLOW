import 'server-only';
import { sql } from 'drizzle-orm';
import { cache } from 'react';
import { pendenciasDoLinkPublico, type Pendencia } from '@/domain/catalogo/pendencias';
import type { RecursosPlano } from '@/domain/cobranca/limites';
import {
  suspensaoPrevista,
  type Situacao,
  type StatusAssinatura,
} from '@/domain/cobranca/situacao';
import { hojeNoFuso } from '@/domain/dates';
import type { PassoOnboarding } from '@/domain/onboarding/passos';
import type { UsuarioAtual } from '@/server/auth/sessao';
import {
  assinaturaDeReferencia,
  recursosDoPlano,
  type FaixaContaDados,
} from '@/server/cobranca/carregar';
import { lerComo } from '@/server/db/tenant';
import { resumoDaLinha, type ResumoHoje } from '@/server/leads/carregar';
import type { EstadoOnboarding } from '@/server/onboarding/carregar';

/*
 * Contexto do painel (Etapa 9.5, A.3): badges, sino, faixas e onboarding numa ida ao banco, por
 * public.painel_contexto() (RLS de quem chama). As regras continuam onde estavam: o SQL chama
 * resumo_hoje() e plano_vigente_da_empresa(); pendências, faixa da conta e assinatura de
 * referência rodam aqui sobre as linhas cruas, com as mesmas funções dos loaders de cada tela.
 * Memoizado por requisição: layout e página dividem a mesma leitura.
 */

export type ContextoPainel = {
  resumo: ResumoHoje;
  naoLidos: number;
  pendencias: Pendencia[];
  onboarding: EstadoOnboarding;
  /** só para o dono (a faixa da conta é dele) */
  conta: FaixaContaDados | null;
  recursos: RecursosPlano;
};

type Json = Record<string, unknown>;

type PacoteJson = {
  id: string;
  ativo: boolean;
  modelo_preco: 'por_pessoa' | 'por_faixa';
  preco_pessoa_centavos: number | null;
  valor_excedente_centavos: number | null;
  preco_confirmado: boolean;
  faixas: number;
};

type AssinaturaJson = {
  status: StatusAssinatura;
  pago_ate: string | null;
  atrasada_desde: string | null;
  criada_em: string;
};

const data = (v: unknown): Date | null => (v == null ? null : new Date(String(v)));

/** jsonb de painel_contexto() → ContextoPainel (exportada para o teste de equivalência). */
export function montarContextoPainel(
  c: Json,
  perfil: UsuarioAtual['perfil'],
  agora = new Date(),
): ContextoPainel {
  const empresa = (c.empresa ?? {}) as Json;
  const catalogo = (c.catalogo ?? {}) as Json;
  const pacotes = (catalogo.pacotes ?? []) as PacoteJson[];

  const pendencias = pendenciasDoLinkPublico({
    pacotes: pacotes.map((p) => ({
      id: p.id,
      ativo: p.ativo,
      modeloPreco: p.modelo_preco,
      precoPessoaCentavos: p.preco_pessoa_centavos,
      valorExcedenteCentavos: p.valor_excedente_centavos,
      quantidadeFaixas: p.faixas,
      precoConfirmado: p.preco_confirmado,
    })),
    tiposEvento: catalogo.tipo_evento_ativo ? [{ ativo: true }] : [],
    turnos: catalogo.turno_ativo ? [{ ativo: true }] : [],
    espacos: catalogo.espaco_ativo ? [{ ativo: true }] : [],
  });

  const concluidoEm = data(empresa.onboarding_concluido_em);
  const onboarding: EstadoOnboarding = {
    passo: Number(empresa.onboarding_passo ?? 1) as PassoOnboarding,
    concluido: concluidoEm !== null,
    iniciadoEm: data(empresa.onboarding_iniciado_em),
    concluidoEm,
    temPacoteConfirmado: pacotes.some((p) => p.ativo && p.preco_confirmado),
    catalogoVazio: pacotes.length === 0,
  };

  let conta: FaixaContaDados | null = null;
  if (perfil === 'dono' && c.empresa) {
    const situacao = empresa.plano as Situacao;
    let suspendeEm: string | null = null;
    let pagoAte: string | null = null;
    if (situacao === 'inadimplente' || situacao === 'cancelado') {
      const lista = ((c.assinaturas ?? []) as AssinaturaJson[]).map((a) => ({
        status: a.status,
        pagoAte: a.pago_ate,
        atrasadaDesde: a.atrasada_desde,
        criadaEm: new Date(a.criada_em),
      }));
      const a = assinaturaDeReferencia(lista, hojeNoFuso(String(empresa.fuso), agora));
      suspendeEm = suspensaoPrevista(a);
      pagoAte = a?.pagoAte ?? null;
    }
    conta = { situacao, trialAte: data(empresa.trial_ate), suspendeEm, pagoAte };
  }

  return {
    resumo: resumoDaLinha((c.resumo ?? undefined) as Json | undefined),
    naoLidos: Number(c.nao_lidos ?? 0),
    pendencias,
    onboarding,
    conta,
    recursos: recursosDoPlano((c.plano ?? {}) as Json),
  };
}

/** Uma ida ao banco por requisição (React cache). */
export const carregarContextoPainel = cache(async (usuario: UsuarioAtual) => {
  const [linhas] = await lerComo(usuario.id, [sql`select public.painel_contexto() as c`]);
  const c = (linhas?.[0]?.c ?? {}) as Json;
  return montarContextoPainel(c, usuario.perfil);
});
