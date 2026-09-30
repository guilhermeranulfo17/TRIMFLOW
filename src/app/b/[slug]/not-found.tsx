import { SearchX } from 'lucide-react';

export default function BuffetNaoEncontrado() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <span className="bg-accent text-primary mb-4 grid size-12 place-items-center rounded-full">
        <SearchX className="size-6" aria-hidden />
      </span>
      <h1 className="text-2xl font-extrabold">Buffet não encontrado</h1>
      <p className="text-muted-foreground mt-2 max-w-sm">
        Confira se o endereço está certo. Se você recebeu este link de um buffet, peça o link
        atualizado para eles.
      </p>
    </main>
  );
}
