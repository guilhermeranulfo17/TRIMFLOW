import { CircleAlert, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatData } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import type { ResultadoOrcamento } from '@/domain/preco/tipos';
import { cn } from '@/lib/utils';

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div
      className={cn('flex items-baseline justify-between gap-3', forte && 'text-lg font-extrabold')}
    >
      <span className={forte ? '' : 'text-muted-foreground'}>{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

export function ResultadoSimulacao({ resultado }: { resultado?: ResultadoOrcamento }) {
  return (
    <Card className="lg:sticky lg:top-20" aria-live="polite">
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg">Resultado</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {!resultado ? (
          <p className="text-muted-foreground">Preencha a festa e toque em “Calcular preço”.</p>
        ) : (
          <>
            {resultado.erros.length > 0 && (
              <ul className="space-y-2" aria-label="Erros">
                {resultado.erros.map((e, i) => (
                  <li
                    key={i}
                    className="rounded-control border-destructive/30 bg-destructive/5 text-destructive flex gap-2 border p-2.5"
                  >
                    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      {e.mensagem} <span className="text-xs opacity-70">({e.codigo})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {resultado.avisos.length > 0 && (
              <ul className="space-y-2" aria-label="Avisos">
                {resultado.avisos.map((a, i) => (
                  <li
                    key={i}
                    className="rounded-control flex gap-2 border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-800 dark:text-amber-200"
                  >
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      {a.mensagem} <span className="text-xs opacity-70">({a.codigo})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-muted-foreground">
              {resultado.convidadosEquivalentes} convidados equivalentes ·{' '}
              {resultado.pessoasFisicas} pessoas
            </p>

            <ul className="rounded-control divide-y border" aria-label="Linhas do orçamento">
              {resultado.linhas.map((l, i) => (
                <li key={i} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{l.descricao}</p>
                    <p className="text-muted-foreground text-xs">{l.detalhe}</p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 tabular-nums',
                      l.subtotalCentavos < 0 && 'text-success',
                    )}
                  >
                    {formatBRL(l.subtotalCentavos)}
                  </span>
                </li>
              ))}
              {resultado.linhas.length === 0 && (
                <li className="text-muted-foreground p-3">Nenhuma linha calculada.</li>
              )}
            </ul>

            <div className="space-y-1.5">
              <Linha rotulo="Subtotal" valor={formatBRL(resultado.subtotalCentavos)} />
              {resultado.descontoCentavos > 0 && (
                <Linha rotulo="Desconto" valor={formatBRL(-resultado.descontoCentavos)} />
              )}
              <div data-testid="total-orcamento">
                <Linha rotulo="Total" valor={formatBRL(resultado.totalCentavos)} forte />
              </div>
              <Linha rotulo="Por convidado" valor={formatBRL(resultado.porConvidadoCentavos)} />
              <Linha rotulo="Sinal para reservar" valor={formatBRL(resultado.sinalCentavos)} />
              <Linha rotulo="Saldo" valor={formatBRL(resultado.saldoCentavos)} />
            </div>

            {resultado.parcelas.length > 0 && (
              <div>
                <p className="mb-2 font-semibold">Parcelas do saldo</p>
                <ul className="space-y-1">
                  {resultado.parcelas.map((p) => (
                    <li key={p.numero} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        {p.numero}ª · vence {formatData(p.vencimento)}
                      </span>
                      <span className="tabular-nums">{formatBRL(p.valorCentavos)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className={cn('text-xs', resultado.ok ? 'text-success' : 'text-destructive')}>
              {resultado.ok ? 'Orçamento válido.' : 'Orçamento com pendências (veja acima).'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
