import { CalendarCheck, Check, MessageCircle, Sparkles } from 'lucide-react';
import { Logo } from '@/components/app/logo';

const BENEFICIOS = [
  'O cliente monta o orçamento sozinho, pelo link do seu buffet.',
  'Você só entra quando ele quer reservar.',
  'Agenda e propostas no mesmo lugar.',
];

/**
 * Lado esquerdo das telas de acesso no PC (≥ 1024 px): a promessa do produto e uma composição
 * estática feita com peças do próprio painel (sem imagem externa).
 */
export function PainelMarca() {
  return (
    <aside
      className="relative hidden overflow-hidden border-r p-12 lg:flex lg:flex-col lg:justify-between"
      style={{
        background:
          'radial-gradient(60% 50% at 20% 15%, rgb(62 228 46 / 0.16), transparent 70%), radial-gradient(50% 40% at 90% 90%, rgb(62 228 46 / 0.08), transparent 70%), var(--background)',
      }}
    >
      <Logo />

      <div className="max-w-md space-y-8">
        <h2 className="text-4xl leading-tight font-extrabold tracking-tight">
          Orçamento que vira <span className="text-primary-texto">festa marcada</span>
        </h2>
        <ul className="space-y-3">
          {BENEFICIOS.map((b) => (
            <li key={b} className="flex items-start gap-3 text-base">
              <span className="bg-primary text-primary-foreground mt-0.5 grid size-6 shrink-0 place-items-center rounded-full">
                <Check className="size-4" aria-hidden />
              </span>
              {b}
            </li>
          ))}
        </ul>

        {/* composição: um lead que quer reservar e a proposta dele */}
        <div className="relative h-56" aria-hidden>
          <div className="bg-card rounded-card absolute top-0 left-0 w-80 border p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="font-bold">Ana</p>
              <span className="bg-alerta/15 text-alerta rounded-full px-2 py-0.5 text-xs font-semibold">
                Quer reservar
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              Aniversário · sáb 14/11 · 60 pessoas
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-lg font-extrabold tabular-nums">R$ 4.900,00</span>
              <span className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold">
                <MessageCircle className="size-3.5" />
                WhatsApp
              </span>
            </div>
          </div>
          <div className="tema-claro bg-card rounded-card absolute top-24 left-40 w-64 border p-4 shadow-2xl">
            <p className="text-xs font-semibold tracking-wide text-primary-texto uppercase">Proposta</p>
            <p className="mt-1 text-sm font-bold">Pacote Alegria · 60 convidados</p>
            <div className="text-muted-foreground mt-3 space-y-1.5 text-xs">
              <p className="flex items-center gap-2">
                <CalendarCheck className="size-3.5" />
                Sábado, 14/11 · Tarde
              </p>
              <p className="flex items-center gap-2">
                <Sparkles className="size-3.5" />
                Decoração e monitores inclusos
              </p>
            </div>
            <p className="mt-3 text-right text-base font-extrabold tabular-nums">
              R$ 4.900,00
            </p>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">Feito para buffets de festas no Brasil.</p>
    </aside>
  );
}
