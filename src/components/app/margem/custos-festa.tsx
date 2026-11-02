'use client';

import { Loader2, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CampoDinheiro } from '@/components/app/campos/campo-dinheiro';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import {
  CATEGORIAS_CUSTO,
  completarComPrevisto,
  ROTULO_CATEGORIA,
  type CategoriaCusto,
  type ItemCustoFesta,
} from '@/domain/modulos';
import {
  fecharFesta,
  prepararFesta,
  reabrirFesta,
  salvarCustosFesta,
} from '@/server/actions/margem';

const CAMPO =
  'rounded-control border-input bg-background focus-visible:ring-ring/50 block h-11 w-full border px-3 text-base font-normal focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-60';

/** Copiar a previsão do pacote para a festa (primeiro passo). */
export function PrepararFesta({
  reservaId,
  pacotes,
  sugerido,
  substituir = false,
}: {
  reservaId: string;
  pacotes: { id: string; nome: string }[];
  sugerido: string | null;
  substituir?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pacote, setPacote] = useState(sugerido ?? pacotes[0]?.id ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        iniciar(async () => {
          const r = await prepararFesta({ reservaId, pacoteId: pacote || null, substituir });
          if (r.ok) {
            toast.sucesso(r.mensagem);
            router.refresh();
          } else setErro(r.erro);
        });
      }}
      data-testid="preparar-festa"
    >
      <label className="flex-1 text-sm font-semibold">
        Pacote vendido
        <select
          className={`${CAMPO} mt-1`}
          value={pacote}
          onChange={(e) => setPacote(e.target.value)}
        >
          <option value="">Sem pacote (lançar os custos à mão)</option>
          {pacotes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pendente} className="min-h-11">
        {pendente && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {substituir ? 'Copiar a previsão de novo' : 'Copiar a previsão do pacote'}
      </Button>
      {erro && (
        <p className="text-erro text-sm font-semibold" role="alert">
          {erro}
        </p>
      )}
    </form>
  );
}

/**
 * Custos da festa: previsto e realizado por item. "Usar o previsto nos itens sem valor"
 * registra de uma vez o que não mudou; o dono digita só as diferenças.
 */
export function CustosFesta({
  reservaId,
  itens: inicial,
  editavel,
  fechada,
}: {
  reservaId: string;
  itens: ItemCustoFesta[];
  editavel: boolean;
  fechada: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [itens, setItens] = useState<ItemCustoFesta[]>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [pendente, iniciar] = useTransition();
  const pode = editavel && !fechada;

  const mudar = (i: number, p: Partial<ItemCustoFesta>) =>
    setItens((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));

  function rodar(fn: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (r.ok) {
        toast.sucesso(r.mensagem ?? 'Salvo.');
        router.refresh();
      } else setErro(r.erro ?? 'Não foi possível salvar.');
    });
  }

  const salvar = (lista = itens) =>
    rodar(() =>
      salvarCustosFesta({
        reservaId,
        itens: lista.map((x) => ({
          categoria: x.categoria,
          descricao: x.descricao,
          previstoCentavos: x.previstoCentavos,
          realizadoCentavos: x.realizadoCentavos,
        })),
      }),
    );

  return (
    <section
      className="bg-card rounded-card flex flex-col gap-3 border p-4"
      aria-labelledby="titulo-custos"
      data-testid="custos-festa"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-custos" className="font-bold">
          Custos variáveis da festa
        </h2>
        {fechada && (
          <span className="bg-sucesso/10 text-sucesso border-sucesso/30 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold">
            <Lock className="size-3" aria-hidden />
            Fechada
          </span>
        )}
      </div>
      {itens.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nenhum custo ainda. Adicione os itens da festa.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {itens.map((x, i) => (
          <li
            key={i}
            className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_9rem_9rem_auto] sm:items-end"
          >
            <label className="text-xs font-semibold">
              Categoria
              <select
                className={`${CAMPO} mt-1`}
                value={x.categoria}
                disabled={!pode}
                onChange={(e) => mudar(i, { categoria: e.target.value as CategoriaCusto })}
              >
                {CATEGORIAS_CUSTO.map((c) => (
                  <option key={c} value={c}>
                    {ROTULO_CATEGORIA[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold">
              Descrição
              <input
                className={`${CAMPO} mt-1`}
                value={x.descricao}
                maxLength={80}
                disabled={!pode}
                onChange={(e) => mudar(i, { descricao: e.target.value })}
              />
            </label>
            <label className="text-xs font-semibold" htmlFor={`previsto-${i}`}>
              Previsto
              <span className="mt-1 block">
                <CampoDinheiro
                  id={`previsto-${i}`}
                  valor={x.previstoCentavos}
                  disabled={!pode}
                  onChange={(n) => mudar(i, { previstoCentavos: n ?? 0 })}
                />
              </span>
            </label>
            <label className="text-xs font-semibold" htmlFor={`realizado-${i}`}>
              Realizado
              <span className="mt-1 block">
                <CampoDinheiro
                  id={`realizado-${i}`}
                  valor={x.realizadoCentavos}
                  disabled={!pode}
                  placeholder="a registrar"
                  onChange={(n) => mudar(i, { realizadoCentavos: n })}
                />
              </span>
            </label>
            {pode && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover ${x.descricao}`}
                onClick={() => setItens((xs) => xs.filter((_, k) => k !== i))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {erro && (
        <p className="text-erro text-sm font-semibold" role="alert">
          {erro}
        </p>
      )}
      {pode && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() =>
              setItens((xs) => [
                ...xs,
                {
                  categoria: 'outros',
                  descricao: 'Outro custo',
                  previstoCentavos: 0,
                  realizadoCentavos: null,
                },
              ])
            }
          >
            <Plus className="size-4" aria-hidden />
            Adicionar custo
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={pendente || itens.every((x) => x.realizadoCentavos !== null)}
            onClick={() => {
              const lista = completarComPrevisto(itens);
              setItens(lista);
              salvar(lista);
            }}
            data-testid="usar-previsto"
          >
            Usar o previsto nos itens sem valor
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={pendente}
            onClick={() => salvar()}
            data-testid="salvar-custos"
          >
            {pendente && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Salvar custos
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={pendente}
            onClick={() => rodar(() => fecharFesta(reservaId))}
            data-testid="fechar-festa"
          >
            <Lock className="size-4" aria-hidden />
            Fechar a festa
          </Button>
        </div>
      )}
      {editavel && fechada && (
        <form
          className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            rodar(() => reabrirFesta({ reservaId, motivo }));
          }}
        >
          <label className="flex-1 text-sm font-semibold">
            Reabrir para corrigir (o motivo fica no histórico)
            <input
              className={`${CAMPO} mt-1`}
              value={motivo}
              maxLength={200}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: nota do fornecedor chegou depois"
            />
          </label>
          <Button type="submit" variant="outline" className="min-h-11" disabled={pendente}>
            <Unlock className="size-4" aria-hidden />
            Reabrir
          </Button>
        </form>
      )}
    </section>
  );
}
