import 'server-only';
import { eq } from 'drizzle-orm';
import type { UsuarioAtual } from '@/server/auth/sessao';
import { empresas } from '@/server/db/schema';
import { naTransacao, type Tx } from '@/server/db/tenant';

export type DadosPrivacidade = {
  retencaoMeses: number;
  exclusaoSolicitadaEm: string | null;
  exclusaoAgendadaPara: string | null;
};

/** Tela Minha empresa → Privacidade e dados (dono). Uma ida ao banco. */
export async function carregarPrivacidade(
  usuario: UsuarioAtual,
  tx?: Tx,
): Promise<DadosPrivacidade> {
  const [e] = await naTransacao(usuario.id, tx, (tx) =>
    tx
      .select({
        retencao: empresas.retencaoLeadsMeses,
        solicitada: empresas.exclusaoSolicitadaEm,
        agendada: empresas.exclusaoAgendadaPara,
      })
      .from(empresas)
      .where(eq(empresas.id, usuario.empresa.id)),
  );
  return {
    retencaoMeses: e?.retencao ?? 24,
    exclusaoSolicitadaEm: e?.solicitada?.toISOString() ?? null,
    exclusaoAgendadaPara: e?.agendada?.toISOString() ?? null,
  };
}
