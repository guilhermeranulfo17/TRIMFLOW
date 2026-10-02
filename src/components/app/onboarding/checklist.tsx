'use client';

import { Check, ChevronDown, Circle, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import type { ItemChecklist } from '@/domain/onboarding/checklist';
import { cn } from '@/lib/utils';
import { dispensarChecklist } from '@/server/actions/onboarding';
import { BotaoLinkNaBio } from './botao-link-na-bio';

/**
 * "Seu link está X% pronto": itens calculados no servidor, cada um levando à tela que resolve.
 * Recolhível (lembra no navegador) e dispensável (por usuário, reativável em Minha conta).
 */
export function ChecklistLink({
  percentual,
  itens,
  dono,
  inicialAberto = false,
}: {
  percentual: number;
  itens: ItemChecklist[];
  dono: boolean;
  inicialAberto?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [aberto, setAberto] = useState(inicialAberto);
  const [salvando, iniciar] = useTransition();
  const grupos = [
    { titulo: 'Para o link funcionar', itens: itens.filter((i) => i.obrigatorio) },
    { titulo: 'Para vender melhor', itens: itens.filter((i) => !i.obrigatorio) },
  ];
  return (
    <section
      className="bg-card rounded-card border"
      data-testid="checklist"
      data-percentual={percentual}
    >
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className="relative grid size-11 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums"
            style={{
              background: `conic-gradient(var(--primary) ${percentual * 3.6}deg, var(--muted) 0deg)`,
            }}
            aria-hidden
          >
            <span className="bg-card grid size-8 place-items-center rounded-full">
              {percentual}%
            </span>
          </span>
          <span className="min-w-0">
            <span className="block font-semibold" data-testid="checklist-titulo">
              Seu link está {percentual}% pronto
            </span>
            <span className="text-muted-foreground block text-sm">
              {itens.filter((i) => !i.feito).length} itens para vender melhor
            </span>
          </span>
          <ChevronDown
            className={cn('ml-auto size-5 shrink-0 transition-transform', aberto && 'rotate-180')}
            aria-hidden
          />
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() =>
            iniciar(async () => {
              const r = await dispensarChecklist(true);
              if (r.ok) {
                toast.sucesso(r.mensagem);
                router.refresh();
              } else toast.erro(r.erro);
            })
          }
          className="hover:bg-accent grid size-11 shrink-0 place-items-center rounded-full"
          aria-label="Dispensar checklist"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      {aberto && (
        <div className="flex flex-col gap-4 border-t p-4">
          {grupos.map((g) => (
            <div key={g.titulo}>
              <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
                {g.titulo}
              </p>
              <ul className="divide-y">
                {g.itens.map((i) => (
                  <li
                    key={i.chave}
                    className="flex items-center gap-3 py-1"
                    data-testid={`item-${i.chave}`}
                    data-feito={i.feito}
                  >
                    {i.feito ? (
                      <Check className="text-primary size-5 shrink-0" aria-label="Feito" />
                    ) : (
                      <Circle
                        className="text-muted-foreground size-5 shrink-0"
                        aria-label="Falta"
                      />
                    )}
                    <Link
                      href={i.href}
                      className={cn(
                        'min-h-11 flex-1 content-center text-sm',
                        i.feito && 'text-muted-foreground line-through',
                      )}
                    >
                      {i.titulo}
                    </Link>
                    {i.manual && dono && <BotaoLinkNaBio feito={i.feito} compacto />}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
