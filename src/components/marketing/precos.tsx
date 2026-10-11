'use client';

import { Check, Minus } from 'lucide-react';
import { useState } from 'react';
import {
  descontoAnual,
  itensDoPlano,
  type CicloVitrine,
  type PlanoVitrine,
} from '@/domain/marketing/precos-vitrine';
import { formatBRL } from '@/domain/money';
import { cn } from '@/lib/utils';
import { BotaoTeste, BotaoWhatsappVendas } from './ctas';

/**
 * Cartões de preço em vidro, por cima da palavra gigante (ver page.tsx); o valor gira ao trocar
 * mensal/anual. Tudo vem de publico.planos_vitrine; sem dados (leitura falhou), os cartões
 * aparecem sem preço e com o WhatsApp de vendas.
 */
export function Precos({
  planos,
  selo,
  implantacaoCentavos,
  diasTeste,
  semDados,
}: {
  planos: PlanoVitrine[];
  selo: string | null;
  implantacaoCentavos: number;
  diasTeste: number;
  semDados: boolean;
}) {
  const [ciclo, setCiclo] = useState<CicloVitrine>('mensal');
  const ordem = [...planos].sort((a, b) => a.precoMensalCentavos - b.precoMensalCentavos);
  const maisCompleto = ordem.at(-1)?.codigo;

  return (
    <div>
      <ul className="relative mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
        {ordem.map((p, i) => {
          const destaque = p.codigo === maisCompleto && ordem.length > 1;
          const d = descontoAnual(p);
          return (
            <li
              key={p.codigo}
              className={cn(
                'ld-vidro ld-holofote ld-cartao ld-revelar relative flex flex-col overflow-hidden rounded-[28px] p-7 md:p-9',
                destaque
                  ? 'order-first border-[rgb(178_247_89/0.45)] shadow-[0_30px_90px_-30px_rgb(178_247_89/0.45)] md:order-none'
                  : 'shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]',
              )}
              style={{ animationRangeStart: `entry ${i * 12}%` }}
              data-testid={`plano-${p.codigo}`}
            >
              {destaque && (
                <span
                  aria-hidden
                  className="ld-brilho pointer-events-none absolute -top-24 -right-24 size-64 rounded-full"
                />
              )}
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-wide text-white/70 uppercase">
                  {p.nome}
                </h3>
                {destaque && (
                  <span className="bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-bold">
                    Mais completo
                  </span>
                )}
              </div>
              {semDados ? null : (
                <div className="mt-5 [perspective:600px]">
                  <p className="flex flex-wrap items-baseline gap-x-1">
                    <span
                      key={ciclo}
                      className="ld-preco-novo text-5xl font-extrabold tracking-[-0.04em] tabular-nums md:text-[3.4rem]"
                      data-testid="preco"
                    >
                      {formatBRL(ciclo === 'mensal' ? p.precoMensalCentavos : p.precoAnualCentavos)}
                    </span>
                    <span className="text-xl font-medium text-white/50">
                      /{ciclo === 'mensal' ? 'mês' : 'ano'}
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-2 min-h-5 text-sm">
                    {ciclo === 'anual' && (
                      <>
                        equivale a {formatBRL(d.mensalEquivalenteCentavos)}/mês
                        {d.economiaCentavos > 0 &&
                          ` · economia de ${formatBRL(d.economiaCentavos)}`}
                      </>
                    )}
                  </p>
                </div>
              )}
              <div className="my-7 h-px bg-gradient-to-r from-white/15 via-white/10 to-transparent" />
              <ul className="flex-1 space-y-3.5 text-sm">
                {itensDoPlano(p).map((item) => (
                  <li
                    key={item.texto}
                    className={cn(
                      'flex items-start gap-3',
                      !item.incluso && 'text-muted-foreground',
                    )}
                  >
                    {item.incluso ? (
                      <span className="bg-primary/15 text-primary-texto grid size-5 shrink-0 place-items-center rounded-full">
                        <Check className="size-3.5" aria-hidden />
                      </span>
                    ) : (
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/5">
                        <Minus className="size-3.5" aria-hidden />
                      </span>
                    )}
                    <span>
                      {item.texto}
                      {!item.incluso && <span className="sr-only"> (não incluso)</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-9 flex flex-col gap-2">
                <BotaoTeste
                  tamanho="medio"
                  className={cn(
                    'min-h-12 w-full',
                    !destaque &&
                      'text-foreground border border-white/15 bg-white/5 hover:bg-white/10',
                  )}
                >
                  Testar {diasTeste} dias grátis
                </BotaoTeste>
                {semDados && <BotaoWhatsappVendas className="w-full" />}
              </div>
            </li>
          );
        })}
      </ul>

      {!semDados && (
        <div className="mt-10 flex flex-col items-center gap-3">
          <div
            role="radiogroup"
            aria-label="Forma de pagamento"
            className="ld-vidro inline-flex rounded-full p-1"
          >
            {(['mensal', 'anual'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={ciclo === c}
                onClick={() => setCiclo(c)}
                className={cn(
                  'focus-visible:ring-ring/60 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors duration-300 focus-visible:ring-[3px] focus-visible:outline-none',
                  ciclo === c ? 'bg-primary text-primary-foreground' : 'hover:bg-white/5',
                )}
                data-testid={`ciclo-${c}`}
              >
                {c === 'mensal' ? 'Mensal' : 'Anual'}
                {c === 'anual' && selo && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-bold',
                      ciclo === c ? 'bg-black/15' : 'bg-primary/15 text-primary-texto',
                    )}
                    data-testid="selo-anual"
                  >
                    {selo}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-muted-foreground mx-auto mt-8 max-w-2xl text-center text-sm">
        Prefere ajuda para começar? Implantação assistida: {formatBRL(implantacaoCentavos)},
        cobrança única e opcional.
      </p>
    </div>
  );
}
