import { Logo } from './logo';
import { UserMenu } from './user-menu';

export function AppHeader({
  nomeBuffet,
  usuario,
}: {
  nomeBuffet: string;
  usuario: { nome: string; email: string; perfil: 'dono' | 'vendedor' };
}) {
  return (
    <header className="bg-background/95 sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b px-4 backdrop-blur md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Logo className="md:hidden [&>span:last-child]:sr-only" />
        <p className="truncate text-base font-bold" data-testid="nome-buffet">
          {nomeBuffet}
        </p>
      </div>
      <UserMenu {...usuario} />
    </header>
  );
}
