import { SinoAvisos } from './avisos/sino';
import { Logo } from './logo';
import { UserMenu } from './user-menu';

export function AppHeader({
  nomeBuffet,
  usuario,
  naoLidos,
}: {
  nomeBuffet: string;
  naoLidos: number;
  usuario: { nome: string; email: string; perfil: 'dono' | 'vendedor' };
}) {
  return (
    <header className="bg-background/90 sticky top-0 z-20 flex h-16 items-center justify-between gap-3 px-4 backdrop-blur md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Logo className="md:hidden [&>span:last-child]:sr-only" />
        <p className="truncate text-base font-bold" data-testid="nome-buffet">
          {nomeBuffet}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <SinoAvisos inicial={naoLidos} />
        <UserMenu {...usuario} />
      </div>
    </header>
  );
}
