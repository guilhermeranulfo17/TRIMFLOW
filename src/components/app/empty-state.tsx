import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icone: Icone,
  titulo,
  children,
}: {
  icone: LucideIcon;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card bg-card mx-auto flex max-w-md flex-col items-center border border-dashed px-6 py-12 text-center">
      <span className="bg-accent text-primary mb-4 grid size-12 place-items-center rounded-full">
        <Icone className="size-6" aria-hidden />
      </span>
      <h2 className="text-lg font-bold">{titulo}</h2>
      <div className="text-muted-foreground mt-2 text-sm">{children}</div>
    </section>
  );
}
