import { Inbox } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/app/empty-state';
import { TituloPagina } from '@/components/app/titulo-pagina';

export const metadata: Metadata = { title: 'Leads' };

export default function LeadsPage() {
  return (
    <>
      <TituloPagina>Leads</TituloPagina>
      <EmptyState icone={Inbox} titulo="Sua caixa de leads">
        Aqui vão aparecer os clientes que montarem orçamento no seu link, em ordem de prioridade:
        quem pediu pré-reserva ou visita aparece primeiro.
      </EmptyState>
    </>
  );
}
