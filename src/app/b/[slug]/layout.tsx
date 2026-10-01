import { carregarBuffet } from '@/server/publico/carregar';
import { estiloDaMarca } from '@/components/publico/marca';

// O banco fica em São Paulo (sa-east-1): as funções do link público rodam perto dele.
export const preferredRegion = 'gru1';

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };

/** Identidade do buffet (cor da marca) em todas as páginas públicas dele. Tema claro. */
export default async function LayoutPublico({ children, params }: Props) {
  const buffet = await carregarBuffet((await params).slug);
  return (
    <div
      className="text-foreground min-h-dvh bg-white"
      style={estiloDaMarca(buffet?.corMarca)}
      data-tema="claro"
    >
      {children}
    </div>
  );
}
