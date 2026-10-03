import { Bloco, EsqueletoTela, EsqueletoTitulo } from '@/components/app/esqueleto';

export default function Carregando() {
  return (
    <EsqueletoTela rotulo="Carregando agenda" largura="max-w-5xl">
      <EsqueletoTitulo />
      <div className="flex gap-2">
        <Bloco className="rounded-control h-11 w-28" />
        <Bloco className="rounded-control h-11 w-28" />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }, (_, i) => (
          <Bloco key={i} className="h-16" />
        ))}
      </div>
    </EsqueletoTela>
  );
}
