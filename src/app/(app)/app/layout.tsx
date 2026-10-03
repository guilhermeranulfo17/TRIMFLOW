import { Suspense } from 'react';
import { AppHeader } from '@/components/app/app-header';
import { SinoAvisos } from '@/components/app/avisos/sino';
import { BottomNav } from '@/components/app/bottom-nav';
import { BotaoOrcamento } from '@/components/app/botao-orcamento';
import {
  BottomNavComBadges,
  FaixasDoPainel,
  SidebarComBadges,
  SinoComContagem,
} from '@/components/app/casca-contexto';
import { Sidebar } from '@/components/app/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProvedorToast } from '@/components/app/toast';
import { FaixaSuporte } from '@/components/app/plano/faixa-suporte';
import { exigirSessao } from '@/server/auth/sessao';
import { lerTema } from '@/server/tema/ler';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // só a identidade bloqueia (redirect); badges, sino e faixas chegam por Suspense
  const [usuario, tema] = await Promise.all([exigirSessao(), lerTema()]);

  return (
    <TooltipProvider delayDuration={150}>
      <ProvedorToast>
        {/* data-painel + data-tema escolhem os tokens do painel (globals.css, ARQUITETURA §59) */}
        <div className="flex min-h-dvh" data-painel data-tema={tema}>
          <Suspense fallback={<Sidebar />}>
            <SidebarComBadges usuario={usuario} />
          </Suspense>
          <div className="flex min-w-0 flex-1 flex-col">
            {usuario.suporte && (
              <FaixaSuporte buffet={usuario.empresa.nome} admin={usuario.suporte.admin} />
            )}
            <Suspense fallback={null}>
              <FaixasDoPainel usuario={usuario} />
            </Suspense>
            <AppHeader
              nomeBuffet={usuario.empresa.nome}
              sino={
                <Suspense fallback={<SinoAvisos inicial={0} />}>
                  <SinoComContagem usuario={usuario} />
                </Suspense>
              }
              usuario={{ nome: usuario.nome, email: usuario.email, perfil: usuario.perfil, tema }}
            />
            <main className="flex-1 px-4 pt-6 pb-40 md:px-8 md:pb-28">{children}</main>
          </div>
        </div>
        <BotaoOrcamento />
        <Suspense fallback={<BottomNav />}>
          <BottomNavComBadges usuario={usuario} />
        </Suspense>
      </ProvedorToast>
    </TooltipProvider>
  );
}
