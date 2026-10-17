import type { Metadata } from 'next';
import Link from 'next/link';
import { ImportarCsv } from '@/components/interno/vendas/importar-csv';
import { exigirAdmin } from '@/server/interno/guard';

export const metadata: Metadata = { title: 'Importar CSV' };
export const dynamic = 'force-dynamic';

export default async function ImportarLeadsVendas() {
  await exigirAdmin();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/interno/vendas/leads" className="text-primary-texto text-sm font-semibold">
        ← Leads
      </Link>
      <h2 className="text-xl font-bold">Importar leads por CSV</h2>
      <ImportarCsv />
    </div>
  );
}
