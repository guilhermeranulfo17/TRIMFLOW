'use client';

import { BellRing, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { inscreverPush, removerPush } from '@/server/actions/avisos';

type Estado =
  'carregando' | 'sem-chave' | 'sem-suporte' | 'ios-instalar' | 'negado' | 'ativo' | 'inativo';

function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

function nomeDoAparelho(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  return 'Computador';
}

const ehIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const instalado = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

/** "Ativar neste aparelho": registra o service worker, pede a permissão e inscreve no push. */
export function PushAparelho({
  chavePublica,
  aparelhos,
}: {
  chavePublica: string | null;
  aparelhos: { endpoint: string; aparelho: string | null; criadoEm: string }[];
}) {
  const toast = useToast();
  const [estado, setEstado] = useState<Estado>('carregando');
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [executando, iniciar] = useTransition();

  useEffect(() => {
    void (async () => {
      if (!chavePublica) return setEstado('sem-chave');
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return setEstado(ehIOS() && !instalado() ? 'ios-instalar' : 'sem-suporte');
      }
      if (Notification.permission === 'denied') return setEstado('negado');
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      setEndpoint(sub?.endpoint ?? null);
      setEstado(sub ? 'ativo' : 'inativo');
    })();
  }, [chavePublica]);

  function ativar() {
    iniciar(async () => {
      try {
        const permissao = await Notification.requestPermission();
        if (permissao !== 'granted') {
          setEstado(permissao === 'denied' ? 'negado' : 'inativo');
          return;
        }
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: chaveParaBytes(chavePublica!),
          }));
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const r = await inscreverPush({
          endpoint: json.endpoint,
          keys: json.keys,
          aparelho: nomeDoAparelho(),
        });
        if (!r.ok) return toast.erro(r.erro);
        setEndpoint(json.endpoint);
        setEstado('ativo');
        toast.sucesso(r.mensagem);
      } catch {
        toast.erro('Não foi possível ativar neste aparelho. Tente de novo.');
      }
    });
  }

  function desativar(alvo: string | null) {
    iniciar(async () => {
      if (!alvo) return;
      if (alvo === endpoint) {
        const reg = await navigator.serviceWorker.getRegistration('/');
        await (await reg?.pushManager.getSubscription())?.unsubscribe();
        setEndpoint(null);
        setEstado('inativo');
      }
      const r = await removerPush(alvo);
      if (r.ok) toast.sucesso(r.mensagem);
      else toast.erro(r.erro);
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="push-aparelho" data-estado={estado}>
      {estado === 'carregando' && (
        <p className="text-muted-foreground text-sm">Verificando este aparelho…</p>
      )}
      {estado === 'sem-chave' && (
        <p className="text-muted-foreground text-sm">
          O push ainda não está configurado no Orkestra. Os avisos continuam chegando no painel.
        </p>
      )}
      {estado === 'sem-suporte' && (
        <p className="text-muted-foreground text-sm">
          Este navegador não recebe notificações. Use o Chrome no Android ou instale o app no
          iPhone.
        </p>
      )}
      {estado === 'ios-instalar' && (
        <div
          className="rounded-control border-info/30 bg-info/10 text-info border p-3 text-sm"
          data-testid="passos-iphone"
        >
          <p className="font-semibold">No iPhone, o aviso chega pelo app instalado:</p>
          <ol className="mt-1 list-decimal pl-5">
            <li>
              Toque em <strong>Compartilhar</strong> (o quadrado com a seta) no Safari.
            </li>
            <li>
              Escolha <strong>Adicionar à Tela de Início</strong>.
            </li>
            <li>Abra o Orkestra pelo ícone novo e volte nesta tela para ativar.</li>
          </ol>
          <p className="mt-1 text-xs opacity-80">Precisa do iOS 16.4 ou mais novo.</p>
        </div>
      )}
      {estado === 'negado' && (
        <p className="rounded-control border-alerta/30 bg-alerta/10 text-alerta border p-3 text-sm">
          As notificações estão bloqueadas para o Orkestra neste navegador. Libere nas configurações
          do navegador e volte aqui.
        </p>
      )}
      {estado === 'inativo' && (
        <Button type="button" onClick={ativar} disabled={executando} className="self-start">
          <BellRing aria-hidden />
          Ativar neste aparelho
        </Button>
      )}
      {estado === 'ativo' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-primary-texto text-sm font-semibold" data-testid="push-ativo">
            Ativo neste aparelho.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => desativar(endpoint)}
            disabled={executando}
          >
            Desativar
          </Button>
        </div>
      )}
      {aparelhos.length > 0 && (
        <ul className="divide-y text-sm">
          {aparelhos.map((a) => (
            <li key={a.endpoint} className="flex items-center gap-2 py-2">
              <Smartphone className="text-muted-foreground size-4" aria-hidden />
              <span className="flex-1">
                {a.aparelho ?? 'Aparelho'}{' '}
                <span className="text-muted-foreground">· desde {a.criadoEm}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remover aparelho"
                onClick={() => desativar(a.endpoint)}
                disabled={executando}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
