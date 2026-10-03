'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';

/** "G" oficial do Google (SVG inline, cores da marca do Google). */
function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}

/**
 * "Continuar com o Google" (só com NEXT_PUBLIC_LOGIN_GOOGLE=1). O Supabase leva ao Google e volta
 * em /auth/callback, que decide entre painel, completar cadastro ou recusa.
 */
export function BotaoGoogle({ next }: { next?: string | null }) {
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState(false);

  async function continuar() {
    setIndo(true);
    setErro(false);
    try {
      const { criarClienteSupabaseNavegador } = await import('@/lib/supabase-browser');
      const volta = new URL('/auth/callback', window.location.origin);
      if (next) volta.searchParams.set('next', next);
      const { error } = await criarClienteSupabaseNavegador().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: volta.toString(), queryParams: { prompt: 'select_account' } },
      });
      if (error) throw error;
    } catch {
      setIndo(false);
      setErro(true);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={continuar}
        disabled={indo}
        className="rounded-botao focus-visible:ring-ring/50 flex h-11 w-full items-center justify-center gap-3 border border-[#dadce0] bg-white px-4 text-sm font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f7f8f8] focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-70"
      >
        {indo ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <LogoGoogle />}
        Continuar com o Google
      </button>
      {erro && (
        <p role="alert" className="text-erro text-sm">
          Não foi possível abrir o Google agora. Tente de novo.
        </p>
      )}
    </div>
  );
}

/** Divisor "ou" entre o Google e o formulário. */
export function DivisorOu() {
  return (
    <div className="text-muted-foreground flex items-center gap-3 text-xs uppercase" aria-hidden>
      <span className="bg-border h-px flex-1" />
      ou
      <span className="bg-border h-px flex-1" />
    </div>
  );
}
