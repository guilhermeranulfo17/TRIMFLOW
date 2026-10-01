'use client';

import { Check } from 'lucide-react';
import { formatBRL } from '@/domain/money';
import { AVISO_DESLOCAMENTO } from '@/domain/publico/previa';
import { classeOpcao, Contador } from '@/components/orcamento/contador';
import type { PropsPasso } from './tipos';

function precoDoExtra(cobranca: string, preco: number): string {
  switch (cobranca) {
    case 'por_pessoa':
      return `${formatBRL(preco)} por convidado`;
    case 'por_unidade':
      return `${formatBRL(preco)} cada`;
    case 'por_hora':
      return `${formatBRL(preco)} por hora`;
    default:
      return formatBRL(preco);
  }
}

/** Passo 5: extras do pacote escolhido (opcional). */
export default function PassoExtras({ vitrine, escolhas, alterar, previa }: PropsPasso) {
  const nomes = new Map(vitrine.opcionais.map((o) => [o.id, o]));
  const extras = (previa?.opcionais ?? []).filter((o) => nomes.has(o.id));
  const qtd = (id: string) => escolhas.opcionais.find((o) => o.opcionalId === id)?.quantidade ?? 0;
  const mudar = (id: string, q: number) =>
    alterar({
      opcionais: [
        ...escolhas.opcionais.filter((o) => o.opcionalId !== id),
        ...(q > 0 ? [{ opcionalId: id, quantidade: q }] : []),
      ],
    });
  const horaExtra = previa?.horaExtraCentavos ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {previa === null && <p className="text-muted-foreground">Carregando extras…</p>}
      {previa !== null && extras.length === 0 && horaExtra === 0 && (
        <p className="text-muted-foreground">
          Este pacote não tem extras para escolher. Toque em <strong>Ver minha proposta</strong>.
        </p>
      )}
      {extras.map((o) => {
        const info = nomes.get(o.id)!;
        const q = qtd(o.id);
        if (o.cobranca === 'por_unidade' || o.cobranca === 'por_hora') {
          return (
            <div key={o.id} className="rounded-card border px-4 py-2" data-testid="opcao-extra">
              <Contador
                id={`extra-${o.id}`}
                rotulo={info.nome}
                dica={`${precoDoExtra(o.cobranca, o.precoCentavos)}${info.descricao ? ` · ${info.descricao}` : ''}`}
                valor={q}
                min={0}
                max={o.qtdMax ?? 100}
                aoMudar={(v) => mudar(o.id, v > 0 ? Math.max(v, o.qtdMin) : 0)}
              />
            </div>
          );
        }
        return (
          <button
            key={o.id}
            type="button"
            role="checkbox"
            aria-checked={q > 0}
            onClick={() => mudar(o.id, q > 0 ? 0 : 1)}
            className={classeOpcao(q > 0)}
            data-testid="opcao-extra"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{info.nome}</span>
              {info.descricao && (
                <span className="text-muted-foreground block text-sm">{info.descricao}</span>
              )}
              <span className="block text-sm font-semibold text-[var(--marca-destaque)]">
                {precoDoExtra(o.cobranca, o.precoCentavos)}
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
      {horaExtra > 0 && (
        <div className="rounded-card border px-4 py-2">
          <Contador
            id="horas-extras"
            rotulo="Horas extras"
            dica={`${formatBRL(horaExtra)} por hora`}
            valor={escolhas.horasExtras}
            max={12}
            aoMudar={(v) => alterar({ horasExtras: v })}
          />
        </div>
      )}
      {previa?.avisos.includes(AVISO_DESLOCAMENTO) && (
        <p className="text-muted-foreground text-sm">{AVISO_DESLOCAMENTO}</p>
      )}
    </div>
  );
}
