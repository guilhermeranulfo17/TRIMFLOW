import type { UsuarioAtual } from '@/server/auth/sessao';
import { faixaDaConta } from '@/domain/plano';
import { carregarContextoPainel } from '@/server/painel/contexto';
import { SinoAvisos } from './avisos/sino';
import { BottomNav } from './bottom-nav';
import { FaixaOnboarding } from './onboarding/faixa-onboarding';
import { FaixaContaPainel } from './plano/faixa-conta';
import { Sidebar } from './sidebar';

/*
 * Peças da casca do painel que dependem do contexto (badges, sino, faixas). Entram por Suspense:
 * a casca e o esqueleto da tela aparecem na hora e estas chegam quando painel_contexto responde
 * (uma ida, memoizada por requisição e dividida com a página).
 */

async function badgesDe(usuario: UsuarioAtual) {
  const { pendencias, resumo } = await carregarContextoPainel(usuario);
  // Leads: pré-reservas e visitas que pedem ação (grupos 1 e 2 da caixa)
  return { '/app/empresa': pendencias.length, '/app/leads': resumo.pedemAcao };
}

export async function SidebarComBadges({ usuario }: { usuario: UsuarioAtual }) {
  return <Sidebar badges={await badgesDe(usuario)} />;
}

export async function BottomNavComBadges({ usuario }: { usuario: UsuarioAtual }) {
  return <BottomNav badges={await badgesDe(usuario)} />;
}

export async function SinoComContagem({ usuario }: { usuario: UsuarioAtual }) {
  const { naoLidos } = await carregarContextoPainel(usuario);
  return <SinoAvisos inicial={naoLidos} />;
}

export async function FaixasDoPainel({ usuario }: { usuario: UsuarioAtual }) {
  const { conta, onboarding } = await carregarContextoPainel(usuario);
  const faixa = conta
    ? faixaDaConta({
        plano: conta.situacao,
        trialAte: conta.trialAte,
        suspendeEm: conta.suspendeEm,
        pagoAte: conta.pagoAte,
      })
    : null;
  return (
    <>
      {faixa && <FaixaContaPainel faixa={faixa} />}
      {usuario.perfil === 'dono' && !onboarding.concluido && (
        <FaixaOnboarding passo={onboarding.passo} />
      )}
    </>
  );
}
