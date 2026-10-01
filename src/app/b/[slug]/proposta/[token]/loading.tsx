/** Esqueleto enquanto a proposta carrega. */
export default function Carregando() {
  return (
    <div
      className="mx-auto max-w-2xl px-4 pt-6"
      aria-busy="true"
      aria-label="Carregando a proposta"
    >
      <div className="bg-muted h-8 w-56 animate-pulse rounded motion-reduce:animate-none" />
      <div className="bg-muted rounded-card mt-6 h-32 animate-pulse motion-reduce:animate-none" />
      <div className="bg-muted rounded-card mt-4 h-48 animate-pulse motion-reduce:animate-none" />
      <div className="bg-muted rounded-control mt-6 h-12 animate-pulse motion-reduce:animate-none" />
    </div>
  );
}
