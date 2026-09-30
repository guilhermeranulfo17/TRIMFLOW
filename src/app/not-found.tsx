import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NaoEncontrado() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-extrabold">Página não encontrada</h1>
      <p className="text-muted-foreground mt-2">
        O endereço pode estar errado ou a página mudou de lugar.
      </p>
      <Button asChild className="mt-6">
        <Link href="/app/leads">Ir para o painel</Link>
      </Button>
    </main>
  );
}
