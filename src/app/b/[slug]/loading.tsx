/** Esqueleto enquanto a página do buffet carrega. */
export default function Carregando() {
  return (
    <div className="mx-auto max-w-2xl" aria-busy="true" aria-label="Carregando">
      <div className="bg-muted aspect-[16/7] w-full animate-pulse motion-reduce:animate-none" />
      <div className="flex flex-col items-center px-4">
        <div className="bg-muted -mt-10 size-20 animate-pulse rounded-full border-4 border-white motion-reduce:animate-none" />
        <div className="bg-muted mt-4 h-7 w-48 animate-pulse rounded motion-reduce:animate-none" />
        <div className="bg-muted mt-4 h-4 w-72 animate-pulse rounded motion-reduce:animate-none" />
      </div>
      <div className="mt-8 flex flex-col gap-3 px-4">
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
