import type { Metadata } from 'next';
import { ProvedorToast } from '@/components/app/toast';

export const metadata: Metadata = {
  title: { default: 'Interno', template: '%s · Orkestra interno' },
  robots: { index: false, follow: false },
};

/** Área da equipe Orkestra: tema escuro do painel, sem menu do buffet. */
export default function LayoutInterno({ children }: { children: React.ReactNode }) {
  return (
    <ProvedorToast>
      <div className="bg-background text-foreground min-h-dvh" data-painel>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
    </ProvedorToast>
  );
}
