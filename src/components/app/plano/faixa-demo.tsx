import { Sparkles } from 'lucide-react';
import { SAIR_DA_DEMO_PARA_CADASTRO } from '@/domain/auth/demo';

/**
 * Faixa da conta de demonstração (Etapa 9B): dados fictícios, nada é salvo e o caminho para criar
 * a conta de verdade. <a> e não <Link>: o destino encerra a sessão (prefetch não pode executar).
 */
export function FaixaDemo() {
  return (
    <div
      role="status"
      data-testid="faixa-demo"
      className="border-info/30 bg-info/10 flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-center text-sm"
    >
      <Sparkles className="text-info size-4 shrink-0" aria-hidden />
      <span>Você está numa demonstração com dados fictícios. Nada do que fizer aqui é salvo.</span>
      <a
        href={SAIR_DA_DEMO_PARA_CADASTRO}
        className="text-primary-texto font-semibold underline-offset-2 hover:underline"
        data-testid="faixa-demo-criar-conta"
      >
        Criar conta grátis
      </a>
    </div>
  );
}
