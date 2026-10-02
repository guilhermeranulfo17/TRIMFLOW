'use client';

import { CalendarClock, Gift, Layers, Package, PartyPopper, Percent, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { carregarModeloDoOnboarding } from '@/server/actions/onboarding';
import type { ResumoModelo } from '@/server/onboarding/carregar';
import { RodapePasso } from './navegacao';

const juntar = (xs: string[]) => (xs.length ? xs.join(', ') : '—');

/** Passo 1: o que veio pronto do modelo do segmento. */
export function PassoModelo({
  resumo,
  vazio,
  segmento,
}: {
  resumo: ResumoModelo;
  vazio: boolean;
  segmento: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [carregando, iniciar] = useTransition();
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
            <i.icone className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
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
      <RodapePasso passo={1} />
    </div>
  );
}
