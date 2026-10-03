import {
  Bloco,
  EsqueletoCartoes,
  EsqueletoTela,
  EsqueletoTitulo,
} from '@/components/app/esqueleto';

export default function Carregando() {
  return (
    <EsqueletoTela rotulo="Carregando orçamento">
      <EsqueletoTitulo />
      <EsqueletoCartoes n={3} className="h-36" />
      <Bloco className="rounded-control h-12" />
    </EsqueletoTela>
  );
}
