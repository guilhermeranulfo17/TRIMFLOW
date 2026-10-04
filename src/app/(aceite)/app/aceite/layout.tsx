import { ProvedorToast } from '@/components/app/toast';

/** Aceite dos termos novos (Etapa 9B): tela única, no escuro das telas de acesso, sem menu. */
export default function LayoutAceite({ children }: { children: React.ReactNode }) {
  return (
    <ProvedorToast>
      <div className="bg-background text-foreground min-h-dvh" data-acesso>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-8">
          {children}
        </main>
      </div>
    </ProvedorToast>
  );
}
