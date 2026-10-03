import { Bloco, EsqueletoCartoes } from '@/components/app/esqueleto';

/** Dentro do layout de Minha empresa (título e navegação já na tela). */
export default function Carregando() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Carregando"
      data-testid="esqueleto"
    >
      <Bloco className="h-6 w-48" />
      <EsqueletoCartoes n={3} className="h-40" />
    </div>
  );
}
