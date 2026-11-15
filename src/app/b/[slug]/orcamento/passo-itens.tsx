'use client';

import { Check } from 'lucide-react';
import { formatData } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { agruparPorCategoria, pessoas } from '@/domain/publico/passos';
import type { ItemPrevia } from '@/domain/publico/previa';
import { classeOpcao, Contador } from '@/components/orcamento/contador';
import type { PropsPasso } from './tipos';

/** Preço como o cliente vê: o valor para a festa dele, ou o de cada unidade/hora. */
function precoDoItem(i: ItemPrevia): string {
  if (!i.porUnidade) return formatBRL(i.valorCentavos);
  return i.cobranca === 'por_hora'
    ? `${formatBRL(i.valorCentavos)} por hora`
    : `${formatBRL(i.valorCentavos)} cada`;
}

/**
 * Passo 4 sem pacote (§96): "Monte sua festa". Os itens vêm agrupados por categoria; o valor de
 * cada um já é o da festa (convidados informados). Item com quantidade por convidado só é
 * marcado: a quantidade fica com o buffet.
 */
export default function PassoItens({ vitrine, escolhas, alterar, previa }: PropsPasso) {
  const info = new Map(vitrine.opcionais.map((o) => [o.id, o]));
  const itens = (previa?.itens ?? [])
    .filter((i) => info.has(i.id))
    .map((i) => ({ ...i, ...info.get(i.id)!, previa: i }));
  const grupos = agruparPorCategoria(itens);
  const qtd = (id: string) => escolhas.opcionais.find((o) => o.opcionalId === id)?.quantidade ?? 0;
  const mudar = (id: string, q: number) =>
    alterar({
      opcionais: [
        ...escolhas.opcionais.filter((o) => o.opcionalId !== id),
        ...(q > 0 ? [{ opcionalId: id, quantidade: q }] : []),
      ],
    });

  if (previa === null) return <p className="text-muted-foreground">Carregando itens…</p>;
  if (itens.length === 0) {
    return (
      <p className="text-muted-foreground">
        O buffet ainda não cadastrou itens para este tipo de festa.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="passo-itens">
      {escolhas.data && (
        <p className="text-muted-foreground -mt-3 text-sm">
          Valores para {pessoas(escolhas)} convidados em {formatData(escolhas.data)}.
        </p>
      )}
      {grupos.map((g) => (
        <section key={g.categoria} aria-label={g.categoria} className="flex flex-col gap-2">
          <h2 className="font-titulo text-lg font-bold">{g.categoria}</h2>
          {g.itens.map((i) => {
            const q = qtd(i.id);
            if (i.previa.porUnidade) {
              return (
                <div key={i.id} className="rounded-card border px-4 py-2" data-testid="opcao-item">
                  <Contador
                    id={`item-${i.id}`}
                    rotulo={i.nome}
                    dica={`${precoDoItem(i.previa)}${i.descricao ? ` · ${i.descricao}` : ''}`}
                    valor={q}
                    min={0}
                    max={i.previa.qtdMax ?? 1000}
                    aoMudar={(v) => mudar(i.id, v > 0 ? Math.max(v, i.previa.qtdMin) : 0)}
                  />
                </div>
              );
            }
            return (
              <button
                key={i.id}
                type="button"
                role="checkbox"
                aria-checked={q > 0}
                onClick={() => mudar(i.id, q > 0 ? 0 : 1)}
                className={classeOpcao(q > 0)}
                data-testid="opcao-item"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{i.nome}</span>
                  {i.descricao && (
                    <span className="text-muted-foreground block text-sm">{i.descricao}</span>
                  )}
                  <span className="block text-sm font-semibold text-[var(--marca-destaque)]">
                    {precoDoItem(i.previa)}
                  </span>
                </span>
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${q > 0 ? 'border-primary bg-primary text-primary-foreground' : ''}`}
                  aria-hidden
                >
                  {q > 0 && <Check className="size-4" />}
                </span>
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}
