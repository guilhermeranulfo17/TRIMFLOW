import type { Metadata } from 'next';
import { CalendarCheck } from 'lucide-react';
import { EmptyState } from '@/components/app/empty-state';
import { exigirAdmin } from '@/server/interno/guard';

export const metadata: Metadata = { title: 'Fila do dia' };
export const dynamic = 'force-dynamic';

export default async function PaginaFilaDoDia() {
  await exigirAdmin();
  return (
    <EmptyState icone={CalendarCheck} titulo="Nada na fila hoje">
      Aqui aparecem os leads novos e os follow-ups vencidos.
    </EmptyState>
  );
}
