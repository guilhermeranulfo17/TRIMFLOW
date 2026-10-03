import { Bloco, EsqueletoCartoes, EsqueletoTela } from '@/components/app/esqueleto';

export default function Carregando() {
  return (
    <EsqueletoTela rotulo="Carregando lead">
      <Bloco className="h-5 w-24" />
      <div className="flex flex-col gap-2">
        <Bloco className="h-8 w-56" />
        <Bloco className="h-4 w-40" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Bloco className="rounded-control h-11 w-32" />
        <Bloco className="rounded-control h-11 w-40" />
        <Bloco className="rounded-control h-11 w-28" />
      </div>
      <EsqueletoCartoes n={3} className="h-28" />
    </EsqueletoTela>
  );
}
