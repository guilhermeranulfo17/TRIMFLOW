import 'server-only';
import { eq, sql } from 'drizzle-orm';
import {
  ehCodigoModulo,
  MODULOS,
  podeVender,
  type CodigoModulo,
  type SituacaoModulo,
  type TextoModulo,
} from '@/domain/modulos';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { cobrancaDisponivel } from '@/server/cobranca/config';
import { empresasCobranca, margemCustosPacote } from '@/server/db/schema';
import { naTransacao, type Tx } from '@/server/db/tenant';

/*
 * Leituras de "Nossas soluções": o catálogo com a situação de cada módulo para a empresa
 * (public.modulos_da_empresa: link da fatura e datas só para o dono) e o guard de acesso
 * (public.modulo_acesso), que as telas e ações de cada módulo usam no servidor.
 */

export type SolucaoTela = TextoModulo & {
  cobranca: 'mensal' | 'por_evento';
  precoCentavos: number;
  /** venda liberada no banco E módulo pronto no código */
  contratavel: boolean;
  carenciaDias: number;
  acessoEventoDias: number | null;
  situacao: SituacaoModulo;
  acesso: boolean;
  eventosAtivos: number;
  pagoAte: string | null;
  linkFatura: string | null;
  faturaVencimento: string | null;
  /** primeiro uso pendente (ex.: OrkMargem sem custos de pacote) */
  configuracaoPendente: boolean;
};

export type TelaSolucoes = {
  solucoes: SolucaoTela[];
  /** contratar, cancelar e pagar: só o dono */
  podeContratar: boolean;
  /** a integração de pagamento está ligada neste ambiente */
  cobrancaLigada: boolean;
  /** dados de cobrança já cadastrados (assinatura-base ou outro adicional) */
  temDadosCobranca: boolean;
};

type LinhaModulo = {
  codigo: string;
  cobranca: 'mensal' | 'por_evento';
  preco_centavos: number;
  venda_liberada: boolean;
  carencia_dias: number;
  acesso_evento_dias: number | null;
  situacao: SituacaoModulo;
  acesso: boolean;
  eventos_ativos: number;
  pago_ate: string | null;
  link_fatura: string | null;
  fatura_vencimento: string | null;
};

export async function carregarSolucoes(usuario: UsuarioAtual, tx?: Tx): Promise<TelaSolucoes> {
  const dono = usuario.perfil === 'dono';
  return naTransacao(usuario.id, tx, async (t) => {
    const [[linha], dados, custos] = await Promise.all([
      t.execute<{ v: LinhaModulo[] }>(sql`select public.modulos_da_empresa() as v`),
      dono
        ? t
            .select({ id: empresasCobranca.empresaId })
            .from(empresasCobranca)
            .where(eq(empresasCobranca.empresaId, usuario.empresa.id))
            .limit(1)
        : Promise.resolve([]),
      dono
        ? t.select({ id: margemCustosPacote.id }).from(margemCustosPacote).limit(1)
        : Promise.resolve([]),
    ]);
    const solucoes = (linha?.v ?? []).flatMap((m): SolucaoTela[] => {
      if (!ehCodigoModulo(m.codigo)) return [];
      return [
        {
          ...MODULOS[m.codigo],
          cobranca: m.cobranca,
          precoCentavos: m.preco_centavos,
          contratavel: podeVender(m.codigo, m.venda_liberada),
          carenciaDias: m.carencia_dias,
          acessoEventoDias: m.acesso_evento_dias,
          situacao: m.situacao,
          acesso: m.acesso,
          eventosAtivos: m.eventos_ativos,
          pagoAte: m.pago_ate,
          linkFatura: m.link_fatura,
          faturaVencimento: m.fatura_vencimento,
          configuracaoPendente: m.codigo === 'orkmargem' && m.acesso && custos.length === 0,
        },
      ];
    });
    return {
      solucoes,
      podeContratar: dono && !usuario.empresa.demo,
      cobrancaLigada: cobrancaDisponivel(),
      temDadosCobranca: dados.length > 0,
    };
  });
}

/** Uma solução da tela (null = código inexistente). */
export async function carregarSolucao(
  usuario: UsuarioAtual,
  codigo: string,
): Promise<(TelaSolucoes & { solucao: SolucaoTela }) | null> {
  if (!ehCodigoModulo(codigo)) return null;
  const tela = await carregarSolucoes(usuario);
  const solucao = tela.solucoes.find((s) => s.codigo === codigo);
  return solucao ? { ...tela, solucao } : null;
}

/** Guard do servidor: o módulo libera operações para a empresa (e a festa, no por evento)? */
export async function moduloComAcesso(
  usuario: UsuarioAtual,
  codigo: CodigoModulo,
  o: { reservaId?: string | null; tx?: Tx } = {},
): Promise<boolean> {
  return naTransacao(usuario.id, o.tx, async (t) => {
    const [l] = await t.execute<{ a: boolean }>(
      sql`select public.modulo_acesso(${usuario.empresa.id}::uuid, ${codigo}, ${o.reservaId ?? null}::uuid) as a`,
    );
    return l?.a === true;
  });
}
