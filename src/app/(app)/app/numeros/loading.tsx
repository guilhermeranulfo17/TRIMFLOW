import {
  Bloco,
  EsqueletoCartoes,
  EsqueletoTela,
  EsqueletoTitulo,
} from '@/components/app/esqueleto';

export default function Carregando() {
  return (
    <EsqueletoTela rotulo="Carregando números" largura="max-w-5xl">
      <EsqueletoTitulo />
      <Bloco className="rounded-control h-11 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <EsqueletoCartoes n={4} className="h-24" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <EsqueletoCartoes n={2} className="h-64" />
      </div>
    </EsqueletoTela>
  );
}
