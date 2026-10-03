import {
  Bloco,
  EsqueletoCartoes,
  EsqueletoTela,
  EsqueletoTitulo,
} from '@/components/app/esqueleto';

/** Esqueleto da caixa enquanto a consulta roda. */
export default function Carregando() {
  return (
    <EsqueletoTela rotulo="Carregando leads">
      <EsqueletoTitulo />
      <div className="flex gap-2 overflow-hidden">
        <EsqueletoCartoes n={5} className="h-16 min-w-32" />
      </div>
      <Bloco className="rounded-control h-11" />
      <EsqueletoCartoes n={5} className="h-32" />
    </EsqueletoTela>
  );
}
