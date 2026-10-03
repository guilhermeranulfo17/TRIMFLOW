import { carregarBuffet, carregarPagina } from '@/server/publico/carregar';
import { estiloDaMarca } from '@/components/publico/marca';
import { classeDaFonte } from '@/components/publico/fontes';

// O banco fica em São Paulo (sa-east-1): as funções do link público rodam perto dele.
export const preferredRegion = 'gru1';

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };

/**
 * Identidade do buffet em todas as páginas públicas dele (vitrine, orçamento e proposta): cor da
 * marca e estilo (fonte dos títulos, raios e decorações). Tema claro.
 */
export default async function LayoutPublico({ children, params }: Props) {
  const { slug } = await params;
  const [buffet, pagina] = await Promise.all([carregarBuffet(slug), carregarPagina(slug)]);
  const estilo = pagina?.estilo ?? 'limpo';
  return (
    <div
      className={`text-foreground min-h-dvh bg-white ${classeDaFonte(estilo)}`}
      style={estiloDaMarca(buffet?.corMarca)}
      data-tema="claro"
      data-estilo={estilo}
    >
      {children}
    </div>
  );
}
