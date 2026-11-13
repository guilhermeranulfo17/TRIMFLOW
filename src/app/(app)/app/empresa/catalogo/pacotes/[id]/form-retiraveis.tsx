'use client';

import { useState, useTransition } from 'react';
import { CampoDinheiro } from '@/components/app/campos';
import { Campo, CampoCheck } from '@/components/app/form/campo';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { salvarRetiraveisPacote } from '@/server/actions/empresa/pacotes';

export type ItemRetiravel = {
  opcionalId: string;
  nome: string;
  removivel: boolean;
  descontoCentavos: number | null;
};

/**
 * Fase 6.5: entre os opcionais inclusos, quais o cliente pode tirar no orçamento e quanto
 * desconta. Sem desconto, o item sai sem mudar o preço (nada é calculado sozinho).
 */
export function FormRetiraveis({
  pacoteId,
  inicial,
  somenteLeitura,
}: {
  pacoteId: string;
  inicial: ItemRetiravel[];
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const [base, setBase] = useState(inicial);
  const [itens, setItens] = useState(inicial);
  const sujo = JSON.stringify(base) !== JSON.stringify(itens);
  const mudar = (id: string, parcial: Partial<ItemRetiravel>) =>
    setItens((atual) => atual.map((i) => (i.opcionalId === id ? { ...i, ...parcial } : i)));

  return (
    <Secao
      id="retiraveis"
      titulo="O cliente pode retirar"
      descricao="Marque os inclusos que o cliente pode tirar do pacote no orçamento. O desconto é opcional: sem ele, o item sai sem mudar o preço."
      salvando={salvando}
      sujo={sujo}
      somenteLeitura={somenteLeitura || itens.length === 0}
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await salvarRetiraveisPacote(pacoteId, {
            itens: itens.map(({ opcionalId, removivel, descontoCentavos }) => ({
              opcionalId,
              removivel,
              descontoCentavos: removivel ? descontoCentavos : null,
            })),
          });
          if (r.ok) {
            toast.sucesso(r.mensagem);
            setBase(itens);
          } else toast.erro(r.erro);
        });
      }}
    >
      {itens.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Marque primeiro os opcionais inclusos neste pacote.
        </p>
      ) : (
        <ul className="divide-y">
          {itens.map((i) => (
            <li
              key={i.opcionalId}
              className="grid gap-2 py-2 sm:grid-cols-[1fr_12rem] sm:items-end"
            >
              <CampoCheck
                id={`retiravel-${i.opcionalId}`}
                rotulo={i.nome}
                dica="Pode retirar"
                checked={i.removivel}
                disabled={somenteLeitura}
                onChange={(e) => mudar(i.opcionalId, { removivel: e.target.checked })}
              />
              {i.removivel && (
                <Campo id={`retiravel-desconto-${i.opcionalId}`} rotulo="Desconto ao retirar">
                  <CampoDinheiro
                    id={`retiravel-desconto-${i.opcionalId}`}
                    placeholder="Sem desconto"
                    valor={i.descontoCentavos}
                    disabled={somenteLeitura}
                    onChange={(v) => mudar(i.opcionalId, { descontoCentavos: v ?? null })}
                  />
                </Campo>
              )}
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}
