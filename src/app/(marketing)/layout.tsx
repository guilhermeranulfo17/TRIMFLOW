/** Landing (Etapa 9.6): claro da marca com fundo off-white; seções escuras com a classe .dark. */
export default function LayoutMarketing({ children }: { children: React.ReactNode }) {
  return (
    <div data-landing className="bg-background text-foreground min-h-dvh">
      {children}
    </div>
  );
}
