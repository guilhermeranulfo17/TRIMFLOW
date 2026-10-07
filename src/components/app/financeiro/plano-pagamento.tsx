'use client';

import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CampoDinheiro } from '@/components/app/campos/campo-dinheiro';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { MENSAGEM_ERRO_PLANO, validarPlano, type ParcelaPlano } from '@/domain/financeiro';
import { formatBRL } from '@/domain/money';
import { salvarPlanoPagamento } from '@/server/actions/financeiro';

const CAMPO =
  'rounded-control border-input bg-background focus-visible:ring-ring/50 mt-1 block h-11 w-full border px-3 text-base font-normal focus-visible:ring-[3px] focus-visible:outline-none';

type Linha = { descricao: string; valorCentavos: number | null; venceEm: string };

/**
 * Editor do plano de pagamento: começa com o plano salvo ou com a sugestão (sinal + parcelas das
 * regras do buffet). A soma das parcelas vira o valor total da festa.
 */
export function PlanoPagamento({
  reservaId,
  inicial,
  salvo,
  hoje,
}: {
  reservaId: string;
  inicial: ParcelaPlano[];
  salvo: boolean;
  hoje: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [editando, setEditando] = useState(!salvo);
  const [linhas, setLinhas] = useState<Linha[]>(
    inicial.length ? inicial : [{ descricao: 'Sinal', valorCentavos: null, venceEm: hoje }],
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const total = linhas.reduce((a, l) => a + (l.valorCentavos ?? 0), 0);

  const mudar = (i: number, m: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...m } : l)));

  function salvar() {
    setErro(null);
    const plano = linhas.map((l) => ({
      descricao: l.descricao,
      valorCentavos: l.valorCentavos ?? 0,
      venceEm: l.venceEm,
    }));
    const e = validarPlano(plano);
    if (e) {
      setErro(MENSAGEM_ERRO_PLANO[e]);
      return;
    }
    iniciar(async () => {
      const r = await salvarPlanoPagamento({ reservaId, parcelas: plano });
      if (r.ok) {
        toast.sucesso(r.mensagem);
        setEditando(false);
        router.refresh();
      } else setErro(r.erro);
    });
  }

  if (!editando) {
    return (
      <button
        type="button"
        className="rounded-control hover:bg-accent inline-flex min-h-11 w-fit items-center gap-2 border px-4 text-sm font-semibold"
        onClick={() => setEditando(true)}
        data-testid="editar-plano"
      >
        Editar plano de pagamento
      </button>
    );
  }

  return (
    <section
      className="bg-card rounded-card flex flex-col gap-3 border p-4"
      data-testid="editor-plano"
    >
      <h2 className="font-bold">
        {salvo ? 'Editar plano de pagamento' : 'Montar plano de pagamento'}
      </h2>
      {!salvo && (
        <p className="text-muted-foreground text-sm">
          Sugestão com o sinal e as parcelas das suas regras. Ajuste o que precisar e salve.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {linhas.map((l, i) => (
          <li
            key={i}
            className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end"
          >
            <label className="col-span-2 text-xs font-semibold sm:col-span-1">
              Descrição
              <input
                className={CAMPO}
                value={l.descricao}
                maxLength={80}
                onChange={(e) => mudar(i, { descricao: e.target.value })}
              />
            </label>
            <label className="text-xs font-semibold" htmlFor={`parcela-valor-${i}`}>
              Valor
              <span className="mt-1 block">
                <CampoDinheiro
                  id={`parcela-valor-${i}`}
                  valor={l.valorCentavos}
                  onChange={(c) => mudar(i, { valorCentavos: c })}
                />
              </span>
            </label>
            <label className="text-xs font-semibold">
              Vence em
              <input
                type="date"
                className={CAMPO}
                value={l.venceEm}
                onChange={(e) => mudar(i, { venceEm: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="hover:bg-accent grid size-11 place-items-center self-end rounded-full"
              aria-label={`Tirar ${l.descricao || `a parcela ${i + 1}`}`}
              disabled={linhas.length <= 1}
              onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {linhas.length < 24 && (
        <button
          type="button"
          className="text-primary-texto inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold"
          onClick={() =>
            setLinhas((ls) => [
              ...ls,
              { descricao: `Parcela ${ls.length}`, valorCentavos: null, venceEm: hoje },
            ])
          }
        >
          <Plus className="size-4" aria-hidden />
          Parcela
        </button>
      )}
      <p className="text-sm">
        Total da festa:{' '}
        <strong className="tabular-nums" data-testid="total-plano">
          {formatBRL(total)}
        </strong>
      </p>
      {erro && (
        <p className="text-erro text-sm font-semibold" role="alert">
          {erro}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          onClick={salvar}
          disabled={pendente}
          className="min-h-12"
          data-testid="salvar-plano"
        >
          {pendente ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          Salvar plano
        </Button>
        {salvo && (
          <Button
            type="button"
            variant="outline"
            className="min-h-12"
            onClick={() => setEditando(false)}
          >
            Cancelar
          </Button>
        )}
      </div>
    </section>
  );
}
