import type { Tema } from '@/domain/tema';
import { Logo } from './logo';
import { UserMenu } from './user-menu';

export function AppHeader({
  nomeBuffet,
  usuario,
  sino,
}: {
  nomeBuffet: string;
  /** sino de avisos (entra por Suspense com a contagem) */
  sino: React.ReactNode;
  usuario: { nome: string; email: string; perfil: 'dono' | 'vendedor'; tema: Tema };
}) {
  return (
    <header className="bg-background/90 sticky top-0 z-20 flex h-16 items-center justify-between gap-3 px-4 backdrop-blur md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Logo compacto className="md:hidden" />
        <p className="truncate text-base font-bold" data-testid="nome-buffet">
          {nomeBuffet}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {sino}
        <UserMenu {...usuario} />
      </div>
    </header>
  );
}
