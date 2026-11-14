'use client';

import { BellRing, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const CHAVE = 'orkestra:lembrete-push';
const PAUSA_MS = 7 * 24 * 3600 * 1000;

const ehIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const instalado = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

/**
 * §93: os avisos (pedido de pré-reserva, mensagem programada…) só chegam no celular ou no PC em
 * que as notificações foram ativadas. Este cartão aparece no Início enquanto ESTE aparelho não
 * estiver ativado; "Agora não" esconde por 7 dias (só neste navegador).
 */
export function LembretePush() {
  const [mostrar, setMostrar] = useState<'ativar' | 'iphone' | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const ate = Number(localStorage.getItem(CHAVE) ?? 0);
        if (ate > Date.now()) return;
      } catch {
        // sem localStorage: segue mostrando
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (ehIOS() && !instalado()) setMostrar('iphone');
        return;
      }
      if (Notification.permission === 'denied') return;
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) setMostrar('ativar');
    })();
  }, []);

  if (!mostrar) return null;
  const pausar = () => {
    try {
      localStorage.setItem(CHAVE, String(Date.now() + PAUSA_MS));
    } catch {
      // sem localStorage: só esconde agora
    }
    setMostrar(null);
  };

  return (
    <div
      className="rounded-card border-info/30 bg-info/10 flex items-start gap-3 border p-3 text-sm"
      data-testid="lembrete-push"
    >
      <BellRing className="text-info mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Receba os avisos neste aparelho</p>
        <p className="text-muted-foreground">
          {mostrar === 'iphone'
            ? 'No iPhone, instale o Orkestra na Tela de Início (Compartilhar → Adicionar à Tela de Início) e ative os avisos.'
            : 'Pedidos de pré-reserva, visitas e mensagens programadas chegam na hora, mesmo com o Orkestra fechado.'}
        </p>
        <Link
          href="/app/conta/avisos"
          className="text-primary-texto mt-1 inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline"
        >
          Ativar agora
        </Link>
      </div>
      <button
        type="button"
        onClick={pausar}
        className="text-muted-foreground hover:text-foreground grid size-11 shrink-0 place-items-center"
        aria-label="Agora não"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
