'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CampoDinheiro } from '@/components/app/campos/campo-dinheiro';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { CATEGORIAS_CUSTO, ROTULO_CATEGORIA, type CustoPacote } from '@/domain/modulos';
import { salvarCustosPacote } from '@/server/actions/margem';

type Valores = Record<string, { fixo: number | null; porConvidado: number | null }>;

/** Custo previsto do pacote por categoria: valor fixo por festa + valor por convidado. */
export function CustosPacote({
  pacoteId,
  nome,
  custos,
  editavel,
}: {
  pacoteId: string;
  nome: string;
  custos: CustoPacote[];
  editavel: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const inicial: Valores = Object.fromEntries(
    CATEGORIAS_CUSTO.map((c) => {
      const x = custos.find((k) => k.categoria === c);
      return [c, { fixo: x?.fixoCentavos ?? null, porConvidado: x?.porConvidadoCentavos ?? null }];
    }),
  );
  const [v, setV] = useState<Valores>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await salvarCustosPacote({
        pacoteId,
        custos: CATEGORIAS_CUSTO.map((c) => ({
          categoria: c,
          fixoCentavos: v[c]?.fixo ?? 0,
          porConvidadoCentavos: v[c]?.porConvidado ?? 0,
        })),
      });
      if (r.ok) {
        toast.sucesso(r.mensagem);
        router.refresh();
      } else setErro(r.erro);
    });
  }

  const idBase = `pacote-${pacoteId}`;
  return (
    <form
      onSubmit={salvar}
      className="bg-card rounded-card border p-4"
      data-testid={`custos-pacote-${nome}`}
    >
      <h3 className="font-bold">{nome}</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th className="pb-2 font-semibold">Categoria</th>
              <th className="pb-2 font-semibold">Fixo por festa</th>
              <th className="pb-2 font-semibold">Por convidado</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIAS_CUSTO.map((c) => (
              <tr key={c} className="border-t">
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  {ROTULO_CATEGORIA[c]}
                </th>
                <td className="py-2 pr-3">
                  <CampoDinheiro
                    id={`${idBase}-${c}-fixo`}
                    aria-label={`${ROTULO_CATEGORIA[c]}: valor fixo por festa`}
                    valor={v[c]?.fixo ?? null}
                    onChange={(n) => setV((x) => ({ ...x, [c]: { ...x[c]!, fixo: n } }))}
                    disabled={!editavel}
                  />
                </td>
                <td className="py-2">
                  <CampoDinheiro
                    id={`${idBase}-${c}-conv`}
                    aria-label={`${ROTULO_CATEGORIA[c]}: valor por convidado`}
                    valor={v[c]?.porConvidado ?? null}
                    onChange={(n) => setV((x) => ({ ...x, [c]: { ...x[c]!, porConvidado: n } }))}
                    disabled={!editavel}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {erro && (
        <p className="text-erro mt-2 text-sm font-semibold" role="alert">
          {erro}
        </p>
      )}
      {editavel && (
        <Button type="submit" disabled={pendente} className="mt-3 min-h-11">
          {pendente && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Salvar custos do {nome}
        </Button>
      )}
    </form>
  );
}
