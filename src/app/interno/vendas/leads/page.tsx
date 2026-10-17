import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { EmptyState } from '@/components/app/empty-state';
import { exigirAdmin } from '@/server/interno/guard';

export const metadata: Metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

export default async function PaginaLeads() {
  await exigirAdmin();
  return (
    <EmptyState icone={Users} titulo="Nenhum lead ainda">
      Cadastre donos de buffet à mão ou importe uma planilha CSV.
    </EmptyState>
  );
}
