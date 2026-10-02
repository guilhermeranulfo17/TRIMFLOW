import { AppHeader } from '@/components/app/app-header';
import { BottomNav } from '@/components/app/bottom-nav';
import { BotaoOrcamento } from '@/components/app/botao-orcamento';
import { Sidebar } from '@/components/app/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProvedorToast } from '@/components/app/toast';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarPendencias } from '@/server/catalogo/pendencias';
import { resumoHoje } from '@/server/leads/carregar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirSessao();
  const [pendencias, hoje] = await Promise.all([
    carregarPendencias(usuario.id),
    resumoHoje(usuario),
  ]);
  // Leads: pré-reservas e visitas que pedem ação (grupos 1 e 2 da caixa)
  const badges = { '/app/empresa': pendencias.length, '/app/leads': hoje.pedemAcao };

  return (
    <TooltipProvider delayDuration={150}>
      <ProvedorToast>
        <div className="flex min-h-dvh">
          <Sidebar badges={badges} />
          <div className="flex min-w-0 flex-1 flex-col">
            <AppHeader
              nomeBuffet={usuario.empresa.nome}
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
