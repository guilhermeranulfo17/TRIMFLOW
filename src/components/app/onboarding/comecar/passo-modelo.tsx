'use client';

import { CalendarClock, Gift, Layers, Package, PartyPopper, Percent, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { carregarModeloDoOnboarding, trocarModeloDoOnboarding } from '@/server/actions/onboarding';
import type { ResumoModelo } from '@/server/onboarding/carregar';
import { RodapePasso } from './navegacao';

const juntar = (xs: string[]) => (xs.length ? xs.join(', ') : '—');

/** Passo 1: o que veio pronto do modelo do segmento. */
export type OpcaoModelo = { chave: string; rotulo: string; descricao: string };

export function PassoModelo({
  resumo,
  vazio,
  segmento,
  modelos = [],
  podeTrocar = false,
}: {
  resumo: ResumoModelo;
  vazio: boolean;
  segmento: string;
  /** modelos do onboarding (infantil, casamento e 15 anos, eventos, domicílio) */
  modelos?: OpcaoModelo[];
  /** catálogo ainda é só o exemplo: dá para trocar o modelo */
  podeTrocar?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [carregando, iniciar] = useTransition();
  const [trocando, setTrocando] = useState(false);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const trocar = (chave: string) =>
    iniciar(async () => {
      const r = await trocarModeloDoOnboarding(chave);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        setTrocando(false);
        setEscolhido(null);
        router.refresh();
      } else toast.erro(r.erro);
    });
  if (vazio) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">
          Vamos começar com um catálogo de exemplo de <strong>{segmento}</strong>: tipos de festa,
          turnos, pacotes e opcionais. Você só ajusta.
        </p>
        <Button
          type="button"
          disabled={carregando}
          onClick={() =>
            iniciar(async () => {
              const r = await carregarModeloDoOnboarding();
              if (r.ok) router.refresh();
              else toast.erro(r.erro);
            })
          }
          data-testid="carregar-modelo-onboarding"
        >
          {carregando ? 'Carregando…' : 'Carregar meu catálogo de exemplo'}
        </Button>
      </div>
    );
  }
  const itens = [
    { icone: PartyPopper, titulo: 'Tipos de festa', texto: juntar(resumo.tiposEvento) },
    { icone: Package, titulo: 'Pacotes', texto: juntar(resumo.pacotes) },
    {
      icone: Gift,
      titulo: 'Opcionais',
      texto: `${resumo.opcionais} opcionais (mesa temática, recreação…)`,
    },
    { icone: CalendarClock, titulo: 'Turnos', texto: juntar(resumo.turnos) },
    { icone: Layers, titulo: 'Espaços', texto: juntar(resumo.espacos) },
    {
      icone: Users,
      titulo: 'Faixas de idade',
      texto: `${resumo.faixasIdade} faixas (quem paga meia, quem não paga)`,
    },
    {
      icone: Percent,
      titulo: 'Tabela de dias',
      texto: `${resumo.ajustesDia} ajustes (ex.: sábado mais caro)`,
    },
  ];
  return (
    <div className="flex flex-col gap-4" data-testid="resumo-modelo">
      <p className="text-muted-foreground">
        Sua conta já veio pronta com o modelo de <strong>{segmento}</strong>. Confira o que tem:
      </p>
      <ul className="bg-card rounded-card divide-y border">
        {itens.map((i) => (
          <li key={i.titulo} className="flex items-start gap-3 p-4">
            <i.icone className="text-primary-texto mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold">{i.titulo}</p>
              <p className="text-muted-foreground text-sm">{i.texto}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-sm">
        Você ajusta tudo isso depois em <strong>Minha empresa</strong>. Agora só faltam os seus
        preços.
      </p>
      {podeTrocar && modelos.length > 0 && (
        <div className="bg-card rounded-card border p-4" data-testid="trocar-modelo">
          {!trocando ? (
            <button
              type="button"
              className="text-primary-texto min-h-11 text-left text-sm font-semibold"
              onClick={() => setTrocando(true)}
            >
              Seu buffet é de outro tipo? Trocar o modelo
            </button>
          ) : (
            <fieldset disabled={carregando}>
              <legend className="font-semibold">Escolha o modelo do seu buffet</legend>
              <p className="text-muted-foreground text-sm">
                O catálogo de exemplo de agora é trocado pelo do modelo escolhido.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup">
                {modelos.map((m) => (
                  <label
                    key={m.chave}
                    className={cn(
                      'rounded-control hover:border-ring has-focus-visible:ring-ring/50 flex min-h-11 cursor-pointer flex-col gap-1 border p-3 has-focus-visible:ring-[3px]',
                      escolhido === m.chave && 'border-primary bg-secondary',
                    )}
                    data-testid={`modelo-${m.chave}`}
                  >
                    <input
                      type="radio"
                      name="modelo"
                      value={m.chave}
                      className="sr-only"
                      checked={escolhido === m.chave}
                      onChange={() => setEscolhido(m.chave)}
                    />
                    <span className="font-semibold">{m.rotulo}</span>
                    <span className="text-muted-foreground text-xs">{m.descricao}</span>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setTrocando(false)}>
                  Voltar
                </Button>
                <Button
                  type="button"
                  disabled={!escolhido || carregando}
                  onClick={() => escolhido && trocar(escolhido)}
                  data-testid="confirmar-troca-modelo"
                >
                  {carregando ? 'Trocando…' : 'Usar este modelo'}
                </Button>
              </div>
            </fieldset>
          )}
        </div>
      )}
      <RodapePasso passo={1} />
    </div>
  );
}
