import { CalendarDays } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/app/empty-state';
import { TituloPagina } from '@/components/app/titulo-pagina';

export const metadata: Metadata = { title: 'Agenda' };

export default function AgendaPage() {
  return (
    <>
      <TituloPagina>Agenda</TituloPagina>
      <EmptyState icone={CalendarDays} titulo="Suas datas em um só lugar">
        Aqui você vai ver cada data e turno como livre, pré-reservado, reservado ou bloqueado, e
        bloquear datas com um toque. Nenhuma data vendida duas vezes.
      </EmptyState>
    </>
  );
}
