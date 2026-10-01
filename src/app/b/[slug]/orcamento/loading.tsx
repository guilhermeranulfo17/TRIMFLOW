/** Esqueleto enquanto o wizard carrega. */
export default function Carregando() {
  return (
    <div
      className="mx-auto max-w-2xl px-4 pt-4"
      aria-busy="true"
      aria-label="Carregando o orçamento"
    >
      <div className="bg-muted h-12 animate-pulse rounded motion-reduce:animate-none" />
      <div className="bg-muted mt-6 h-8 w-64 animate-pulse rounded motion-reduce:animate-none" />
      <div className="mt-6 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-muted rounded-card h-16 animate-pulse motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
