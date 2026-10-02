/** Esqueleto da caixa enquanto a consulta roda. */
export default function Carregando() {
  return (
    <div
      className="mx-auto flex max-w-3xl flex-col gap-4"
      aria-busy="true"
      aria-label="Carregando leads"
    >
      <div className="bg-muted h-8 w-32 animate-pulse rounded-md" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="bg-muted rounded-card h-16 min-w-32 animate-pulse" />
        ))}
      </div>
      <div className="bg-muted rounded-control h-11 animate-pulse" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="bg-muted rounded-card h-32 animate-pulse" />
      ))}
    </div>
  );
}
