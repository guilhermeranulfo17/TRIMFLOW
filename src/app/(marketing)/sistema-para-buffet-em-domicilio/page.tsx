import { metadataDoSegmento, PaginaDeSegmento } from '@/components/marketing/pagina-segmento';

// Estática como a landing (§98): refeita a cada 5 min, com o preço em cache.
export const revalidate = 300;

export const metadata = metadataDoSegmento('domicilio');

export default function Pagina() {
  return <PaginaDeSegmento chave="domicilio" />;
}
