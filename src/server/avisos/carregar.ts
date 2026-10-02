import 'server-only';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import {
  CANAIS_PADRAO,
  canaisDisponiveis,
  canaisDoTipo,
  TIPOS_CONFIGURAVEIS,
  type CanalExterno,
  type TipoAviso,
} from '@/domain/avisos/canais';
import { SILENCIO_PADRAO } from '@/domain/avisos/silencio';
import { textoAviso } from '@/domain/avisos/textos';
import { formatDataHora } from '@/domain/dates';
import {
  LIGADA_PADRAO,
  PRAZOS,
  REGRAS_FOLLOW_UP,
  type RegraFollowUp,
} from '@/domain/follow-up/regras';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { avisos, preferenciasAvisos, pushInscricoes, regrasFollowUp } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';

/* Leituras dos avisos (RLS: cada um só vê os próprios). Textos montados aqui, no servidor. */

export type AvisoVista = {
  id: string;
  tipo: TipoAviso;
  titulo: string;
  corpo: string;
  caminho: string;
  quando: string;
  lido: boolean;
};

export async function contarNaoLidos(usuario: UsuarioAtual): Promise<number> {
  const [r] = await comUsuario(usuario.id, (tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(avisos)
      .where(and(eq(avisos.usuarioId, usuario.id), isNull(avisos.lidoEm))),
  );
  return r?.n ?? 0;
}

/** Não lidos primeiro, depois os mais recentes; `dias` limita o histórico. */
export async function listarAvisos(
  usuario: UsuarioAtual,
  o: { limite?: number; dias?: number } = {},
): Promise<AvisoVista[]> {
  const desde = new Date(Date.now() - (o.dias ?? 30) * 86_400_000);
  const linhas = await comUsuario(usuario.id, (tx) =>
    tx
      .select()
      .from(avisos)
      .where(and(eq(avisos.usuarioId, usuario.id), gte(avisos.criadoEm, desde)))
      .orderBy(sql`${avisos.lidoEm} is not null`, desc(avisos.criadoEm))
      .limit(o.limite ?? 200),
  );
  const agora = new Date();
  return linhas.map((a) => {
    const t = textoAviso(a.tipo, a.dados, {
      leadId: a.leadId,
      agora,
      fuso: usuario.empresa.fuso,
      agrupados: a.agrupados,
    });
    return {
      id: a.id,
      tipo: a.tipo,
      ...t,
      quando: formatDataHora(a.criadoEm, usuario.empresa.fuso),
      lido: a.lidoEm !== null,
    };
  });
}

export type PreferenciasTela = {
  canais: Record<TipoAviso, CanalExterno[]>;
  disponiveis: Record<TipoAviso, CanalExterno[]>;
  silencioInicio: string;
  silencioFim: string;
  receberDeVendedores: boolean;
  whatsappAtivo: boolean;
  whatsappNumero: string | null;
  whatsappAceiteEm: string | null;
  aparelhos: { endpoint: string; aparelho: string | null; criadoEm: string }[];
};

export async function carregarPreferencias(usuario: UsuarioAtual): Promise<PreferenciasTela> {
  const [prefs, inscricoes] = await comUsuario(
    usuario.id,
    async (tx) =>
      [
        (
          await tx
            .select()
            .from(preferenciasAvisos)
            .where(eq(preferenciasAvisos.usuarioId, usuario.id))
        )[0],
        await tx.select().from(pushInscricoes).where(eq(pushInscricoes.usuarioId, usuario.id)),
      ] as const,
  );
  const canais = {} as Record<TipoAviso, CanalExterno[]>;
  const disponiveis = {} as Record<TipoAviso, CanalExterno[]>;
  for (const t of TIPOS_CONFIGURAVEIS) {
    canais[t] = prefs ? canaisDoTipo(t, prefs.canais) : [...CANAIS_PADRAO[t]];
    disponiveis[t] = canaisDisponiveis(t);
  }
  return {
    canais,
    disponiveis,
    silencioInicio: prefs?.silencioInicio.slice(0, 5) ?? SILENCIO_PADRAO.inicio,
    silencioFim: prefs?.silencioFim.slice(0, 5) ?? SILENCIO_PADRAO.fim,
    receberDeVendedores: prefs?.receberDeVendedores ?? false,
    whatsappAtivo: prefs?.whatsappAtivo ?? false,
    whatsappNumero: prefs?.whatsappNumero ?? null,
    whatsappAceiteEm: prefs?.whatsappAceiteEm
      ? formatDataHora(prefs.whatsappAceiteEm, usuario.empresa.fuso)
      : null,
    aparelhos: inscricoes.map((i) => ({
      endpoint: i.endpoint,
      aparelho: i.aparelho,
      criadoEm: formatDataHora(i.criadoEm, usuario.empresa.fuso),
    })),
  };
}

export type RegraTela = { regra: RegraFollowUp; ligada: boolean; prazo: number | null };

export async function carregarRegrasFollowUp(usuario: UsuarioAtual): Promise<RegraTela[]> {
  const linhas = await comUsuario(usuario.id, (tx) =>
    tx.select().from(regrasFollowUp).where(eq(regrasFollowUp.empresaId, usuario.empresa.id)),
  );
  return REGRAS_FOLLOW_UP.map((regra) => {
    const l = linhas.find((x) => x.regra === regra);
    return {
      regra,
      ligada: l?.ligada ?? LIGADA_PADRAO[regra],
      prazo: l ? l.prazo : (PRAZOS[regra]?.padrao ?? null),
    };
  });
}
