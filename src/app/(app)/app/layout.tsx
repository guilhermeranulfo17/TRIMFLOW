import { AppHeader } from '@/components/app/app-header';
import { BottomNav } from '@/components/app/bottom-nav';
import { BotaoOrcamento } from '@/components/app/botao-orcamento';
import { Sidebar } from '@/components/app/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { exigirSessao } from '@/server/auth/sessao';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirSessao();

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader
            nomeBuffet={usuario.empresa.nome}
            usuario={{ nome: usuario.nome, email: usuario.email, perfil: usuario.perfil }}
          />
          <main className="flex-1 px-4 pt-6 pb-40 md:px-8 md:pb-28">{children}</main>
        </div>
      </div>
      <BotaoOrcamento />
      <BottomNav />
    </TooltipProvider>
  );
}
