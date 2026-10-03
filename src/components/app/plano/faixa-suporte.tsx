import { ShieldAlert } from 'lucide-react';
import { sairDoSuporte } from '@/server/actions/interno';

/** Faixa vermelha fixa enquanto a equipe Orkestra está dentro da conta (modo suporte). */
export function FaixaSuporte({ buffet, admin }: { buffet: string; admin: string }) {
  return (
    <div
      role="status"
      data-testid="faixa-suporte"
      className="sticky top-0 z-50 flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white"
    >
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <span>
        Suporte Orkestra acessando a conta de {buffet} ({admin})
      </span>
      <form action={sairDoSuporte}>
        <button
          type="submit"
          className="rounded-full border border-white/60 px-3 py-1 underline-offset-2"
        >
          Sair do modo suporte
        </button>
      </form>
    </div>
  );
}
