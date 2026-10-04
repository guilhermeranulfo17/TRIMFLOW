'use client';

import { Check, Minus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { FaixaFundador } from '@/domain/marketing/fundador';
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
 * Cartões de preço (seção escura). Tudo vem de publico.planos_vitrine; sem dados (leitura
 * falhou), os cartões aparecem sem preço e com o WhatsApp de vendas.
 */
export function Precos({
  planos,
  selo,
  fundador,
  implantacaoCentavos,
  diasTeste,
  semDados,
}: {
  planos: PlanoVitrine[];
  selo: string | null;
  fundador: FaixaFundador | null;
  implantacaoCentavos: number;
  diasTeste: number;
  semDados: boolean;
}) {
  const [ciclo, setCiclo] = useState<CicloVitrine>('mensal');
  const ordem = [...planos].sort((a, b) => a.precoMensalCentavos - b.precoMensalCentavos);
  const maisCompleto = ordem.at(-1)?.codigo;

  return (
    <div>
      {!semDados && (
        <div className="mt-10 flex flex-col items-center gap-3">
          <div
            role="radiogroup"
            aria-label="Forma de pagamento"
            className="bg-card inline-flex rounded-full border p-1"
          >
            {(['mensal', 'anual'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={ciclo === c}
                onClick={() => setCiclo(c)}
                className={cn(
                  'focus-visible:ring-ring/60 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:ring-[3px] focus-visible:outline-none',
                  ciclo === c ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
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

      {fundador && <FaixaDoFundador f={fundador} />}

      <ul className="mx-auto mt-8 grid max-w-4xl gap-5 md:grid-cols-2">
        {ordem.map((p) => {
          const destaque = p.codigo === maisCompleto && ordem.length > 1;
          const d = descontoAnual(p);
          return (
            <li
              key={p.codigo}
              className={cn(
                'bg-card rounded-card relative flex flex-col border p-6 md:p-8',
                destaque ? 'border-primary order-first md:order-none' : '',
              )}
              data-testid={`plano-${p.codigo}`}
            >
              {destaque && (
                <span className="bg-primary text-primary-foreground absolute -top-3 left-6 rounded-full px-3 py-1 text-xs font-bold">
                  Mais completo
                </span>
              )}
              <h3 className="text-xl font-bold">{p.nome}</h3>
              {semDados ? null : ciclo === 'mensal' ? (
                <p className="mt-4">
                  <span className="text-4xl font-extrabold tabular-nums" data-testid="preco">
                    {formatBRL(p.precoMensalCentavos)}
                  </span>
                  <span className="text-muted-foreground">/mês</span>
                </p>
              ) : (
                <div className="mt-4">
                  <p>
                    <span className="text-4xl font-extrabold tabular-nums" data-testid="preco">
                      {formatBRL(p.precoAnualCentavos)}
                    </span>
                    <span className="text-muted-foreground">/ano</span>
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    equivale a {formatBRL(d.mensalEquivalenteCentavos)}/mês
                    {d.economiaCentavos > 0 && ` · economia de ${formatBRL(d.economiaCentavos)}`}
                  </p>
                </div>
              )}
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {itensDoPlano(p).map((i) => (
                  <li
                    key={i.texto}
                    className={cn(
                      'flex items-start gap-2.5',
                      !i.incluso && 'text-muted-foreground',
                    )}
                  >
                    {i.incluso ? (
                      <Check className="text-primary-texto mt-0.5 size-4 shrink-0" aria-hidden />
                    ) : (
                      <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
                    )}
                    <span>
                      {i.texto}
                      {!i.incluso && <span className="sr-only"> (não incluso)</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col gap-2">
                <BotaoTeste tamanho="medio" className="w-full">
                  Testar {diasTeste} dias grátis
                </BotaoTeste>
                {semDados && <BotaoWhatsappVendas className="w-full" />}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground mx-auto mt-8 max-w-2xl text-center text-sm">
        Prefere ajuda para começar? Implantação assistida: {formatBRL(implantacaoCentavos)},
        cobrança única e opcional.
      </p>
    </div>
  );
}

function FaixaDoFundador({ f }: { f: FaixaFundador }) {
  return (
    <div
      className="border-primary/40 bg-primary/10 mx-auto mt-6 flex max-w-4xl items-start gap-3 rounded-2xl border p-4 text-sm sm:items-center"
      data-testid="faixa-fundador"
    >
      <Sparkles className="text-primary-texto mt-0.5 size-5 shrink-0 sm:mt-0" aria-hidden />
      <p>
        <strong>Vagas de fundador</strong>
        {f.vagas !== null && f.totalVagas !== null && (
          <>
            : restam {f.vagas} de {f.totalVagas}
          </>
        )}
        . {f.planoNome} por {formatBRL(f.valorCentavos)}/{f.ciclo === 'anual' ? 'ano' : 'mês'} por{' '}
        {f.meses} {f.meses === 1 ? 'mês' : 'meses'}, com o cupom <strong>FUNDADOR</strong> ao
        assinar.
      </p>
    </div>
  );
}
