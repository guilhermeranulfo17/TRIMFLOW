import { AppHeader } from '@/components/app/app-header';
import { FaixaOnboarding } from '@/components/app/onboarding/faixa-onboarding';
import { BottomNav } from '@/components/app/bottom-nav';
import { BotaoOrcamento } from '@/components/app/botao-orcamento';
import { Sidebar } from '@/components/app/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProvedorToast } from '@/components/app/toast';
import { FaixaContaPainel } from '@/components/app/plano/faixa-conta';
import { FaixaSuporte } from '@/components/app/plano/faixa-suporte';
import { faixaDaConta } from '@/domain/plano';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarFaixaConta } from '@/server/cobranca/carregar';
import { carregarPendencias } from '@/server/catalogo/pendencias';
import { contarNaoLidos } from '@/server/avisos/carregar';
import { resumoHoje } from '@/server/leads/carregar';
import { carregarEstadoOnboarding } from '@/server/onboarding/carregar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirSessao();
  const [pendencias, hoje, naoLidos, onboarding, conta] = await Promise.all([
    carregarPendencias(usuario.id),
    resumoHoje(usuario),
    contarNaoLidos(usuario),
    usuario.perfil === 'dono' ? carregarEstadoOnboarding(usuario) : null,
    carregarFaixaConta(usuario),
  ]);
  const faixa = conta
    ? faixaDaConta({
        plano: conta.situacao,
        trialAte: conta.trialAte,
        suspendeEm: conta.suspendeEm,
        pagoAte: conta.pagoAte,
      })
    : null;
  // Leads: pré-reservas e visitas que pedem ação (grupos 1 e 2 da caixa)
  const badges = { '/app/empresa': pendencias.length, '/app/leads': hoje.pedemAcao };

  return (
    <TooltipProvider delayDuration={150}>
      <ProvedorToast>
        {/* data-painel liga o tema escuro do painel (globals.css) */}
        <div className="flex min-h-dvh" data-painel>
          <Sidebar badges={badges} />
          <div className="flex min-w-0 flex-1 flex-col">
            {usuario.suporte && (
              <FaixaSuporte buffet={usuario.empresa.nome} admin={usuario.suporte.admin} />
            )}
            {faixa && <FaixaContaPainel faixa={faixa} />}
            {onboarding && !onboarding.concluido && <FaixaOnboarding passo={onboarding.passo} />}
            <AppHeader
              nomeBuffet={usuario.empresa.nome}
              naoLidos={naoLidos}
              usuario={{ nome: usuario.nome, email: usuario.email, perfil: usuario.perfil }}
            />
            <main className="flex-1 px-4 pt-6 pb-40 md:px-8 md:pb-28">{children}</main>
          </div>
        </div>
        <BotaoOrcamento />
        <BottomNav badges={badges} />
      </ProvedorToast>
    </TooltipProvider>
  );
}
