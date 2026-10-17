import type { Metadata } from 'next';
import Link from 'next/link';
import { FormLeadVendas } from '@/components/interno/vendas/form-lead';
import { LEAD_VAZIO } from '@/domain/vendas/lead';
import { exigirAdmin } from '@/server/interno/guard';

export const metadata: Metadata = { title: 'Novo lead' };
export const dynamic = 'force-dynamic';

export default async function NovoLeadVendas() {
  await exigirAdmin();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/interno/vendas/leads" className="text-primary-texto text-sm font-semibold">
        ← Leads
      </Link>
      <h2 className="text-xl font-bold">Novo lead</h2>
      <FormLeadVendas inicial={LEAD_VAZIO} />
    </div>
  );
}
