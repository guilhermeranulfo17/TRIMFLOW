'use client';

import { useState, useTransition } from 'react';
import { CampoCheck } from '@/components/app/form/campo';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import type { ResultadoAcao } from '@/server/actions/empresa/comum';

export type OpcaoSelecao = { id: string; rotulo: string; dica?: string; desabilitada?: boolean };

/** Seção com uma lista de caixas de seleção salva de uma vez (tipos de festa, inclusos…). */
export function SecaoSelecao({
  id,
  titulo,
  descricao,
  opcoes,
  selecionados: iniciais,
  vazio,
  somenteLeitura,
  onSalvar,
}: {
  id: string;
  titulo: string;
  descricao: string;
  opcoes: OpcaoSelecao[];
  selecionados: string[];
  vazio: React.ReactNode;
  somenteLeitura: boolean;
  onSalvar: (ids: string[]) => Promise<ResultadoAcao>;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const [base, setBase] = useState(iniciais);
  const [selecionados, setSelecionados] = useState(iniciais);
  const sujo = [...base].sort().join() !== [...selecionados].sort().join();

  return (
    <Secao
      id={id}
      titulo={titulo}
      descricao={descricao}
      salvando={salvando}
      sujo={sujo}
      somenteLeitura={somenteLeitura || opcoes.length === 0}
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await onSalvar(selecionados);
          if (r.ok) {
            toast.sucesso(r.mensagem);
            setBase(selecionados);
          } else toast.erro(r.erro);
        });
      }}
    >
      {opcoes.length === 0 ? (
        <div className="text-muted-foreground text-sm">{vazio}</div>
      ) : (
        <div className="grid gap-x-4 sm:grid-cols-2">
          {opcoes.map((o) => (
            <CampoCheck
              key={o.id}
              id={`${id}-${o.id}`}
              rotulo={o.rotulo}
              dica={o.dica}
              disabled={o.desabilitada}
              checked={selecionados.includes(o.id)}
              onChange={(e) =>
                setSelecionados((atual) =>
                  e.target.checked ? [...atual, o.id] : atual.filter((x) => x !== o.id),
                )
              }
            />
          ))}
        </div>
      )}
    </Secao>
  );
}
