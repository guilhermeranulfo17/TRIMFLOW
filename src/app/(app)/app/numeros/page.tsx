import { BarChart3 } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/app/empty-state';
import { TituloPagina } from '@/components/app/titulo-pagina';

export const metadata: Metadata = { title: 'Números' };

export default function NumerosPage() {
  return (
    <>
      <TituloPagina>Números</TituloPagina>
      <EmptyState icone={BarChart3} titulo="Seu link está trazendo reservas?">
        Aqui você vai acompanhar visitas ao link, leads, pré-reservas e reservas, de onde vem quem
        fecha e a ocupação dos próximos meses.
      </EmptyState>
    </>
  );
}
