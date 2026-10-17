import type { Metadata } from 'next';
import { Columns3 } from 'lucide-react';
import { EmptyState } from '@/components/app/empty-state';
import { exigirAdmin } from '@/server/interno/guard';

export const metadata: Metadata = { title: 'Pipeline' };
export const dynamic = 'force-dynamic';

export default async function PaginaPipeline() {
  await exigirAdmin();
  return (
    <EmptyState icone={Columns3} titulo="Pipeline vazio">
      Os leads aparecem aqui nas etapas Novo, Abordado, Respondeu, Interessado, Fechando, Cliente e
      Perdido.
    </EmptyState>
  );
}
