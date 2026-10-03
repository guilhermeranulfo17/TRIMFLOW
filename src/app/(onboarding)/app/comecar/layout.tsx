import { ProvedorToast } from '@/components/app/toast';
import { lerTema } from '@/server/tema/ler';

/** Onboarding em tela cheia (sem menu): um passo por tela, no tema do painel. */
export default async function LayoutComecar({ children }: { children: React.ReactNode }) {
  return (
    <ProvedorToast>
      <div className="min-h-dvh" data-painel data-tema={await lerTema()}>
        <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 pt-6 pb-32">{children}</main>
      </div>
    </ProvedorToast>
  );
}
