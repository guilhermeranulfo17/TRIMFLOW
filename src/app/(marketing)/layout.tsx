/** Landing: toda no escuro da marca (tokens de [data-landing] em globals.css). */
export default function LayoutMarketing({ children }: { children: React.ReactNode }) {
  return (
    <div data-landing className="bg-background text-foreground min-h-dvh">
      {children}
    </div>
  );
}
