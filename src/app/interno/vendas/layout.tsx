import type { Metadata } from 'next';
import Link from 'next/link';
import { AbasVendas } from '@/components/interno/vendas/abas-vendas';
import { exigirAdmin } from '@/server/interno/guard';

export const metadata: Metadata = {
  title: { default: 'Vendas', template: '%s · Vendas Orkestra' },
};

/**
 * Vendas Orkestra (Etapa 14, §77): CRM interno da equipe para vender o Orkestra a donos de
 * buffet. Dados próprios (tabelas vendas_*), nunca os leads dos buffets. Cada página também
 * chama exigirAdmin(): o layout não protege as server actions.
 */
export default async function LayoutVendas({ children }: { children: React.ReactNode }) {
  const admin = await exigirAdmin();
  return (
    <div className="flex flex-col gap-5" data-testid="vendas-orkestra">
      <header className="flex flex-col gap-3">
        <Link href="/interno" className="text-primary-texto text-sm font-semibold">
          ← Interno
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Vendas Orkestra</h1>
          <span className="text-muted-foreground text-sm">{admin.email}</span>
        </div>
        <AbasVendas />
      </header>
      {children}
    </div>
  );
}
