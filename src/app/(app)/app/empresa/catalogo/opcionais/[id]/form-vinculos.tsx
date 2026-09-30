'use client';

import { useState, useTransition } from 'react';
import { CampoCheck } from '@/components/app/form/campo';
import { classeCampo } from '@/components/app/form/estilos';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import type { VinculosOpcionalEntrada } from '@/domain/validacao/catalogo';
import { salvarVinculosOpcional } from '@/server/actions/empresa/opcionais';

type Relacao = 'nenhuma' | 'compativel' | 'incluso';

/**
 * Relação do opcional com cada pacote. Um select por pacote garante que ele nunca é
 * compatível e incluso ao mesmo tempo. Nenhum compatível = vale para todos os pacotes.
 */
export function FormVinculos({
  opcionalId,
  pacotes,
  tipos,
  inicial,
  somenteLeitura,
}: {
  opcionalId: string;
  pacotes: { id: string; nome: string }[];
  tipos: { id: string; nome: string }[];
  inicial: VinculosOpcionalEntrada;
  somenteLeitura: boolean;
}) {
  const toast = useToast();
  const [salvando, iniciar] = useTransition();
  const mapaInicial = () =>
    Object.fromEntries(
      pacotes.map((p) => [
        p.id,
        (inicial.pacotes.find((v) => v.pacoteId === p.id)?.relacao ?? 'nenhuma') as Relacao,
      ]),
    );
  const [base, setBase] = useState(() => ({
    relacoes: mapaInicial(),
    tipos: inicial.tipoEventoIds,
  }));
  const [relacoes, setRelacoes] = useState<Record<string, Relacao>>(base.relacoes);
  const [tiposSel, setTiposSel] = useState<string[]>(base.tipos);
  const sujo =
    JSON.stringify(relacoes) !== JSON.stringify(base.relacoes) ||
    [...tiposSel].sort().join() !== [...base.tipos].sort().join();
  const nenhumCompativel = !Object.values(relacoes).includes('compativel');

  return (
    <Secao
      id="vinculos"
      titulo="Pacotes e tipos de festa"
      descricao="Em quais pacotes o opcional pode ser comprado ou já vem incluso."
      salvando={salvando}
      sujo={sujo}
      somenteLeitura={somenteLeitura}
      onSubmit={(e) => {
        e.preventDefault();
        const entrada: VinculosOpcionalEntrada = {
          pacotes: Object.entries(relacoes)
            .filter(([, r]) => r !== 'nenhuma')
            .map(([pacoteId, r]) => ({ pacoteId, relacao: r as 'compativel' | 'incluso' })),
          tipoEventoIds: tiposSel,
        };
        iniciar(async () => {
          const r = await salvarVinculosOpcional(opcionalId, entrada);
          if (r.ok) {
            toast.sucesso(r.mensagem);
            setBase({ relacoes, tipos: tiposSel });
          } else toast.erro(r.erro);
        });
      }}
    >
      {pacotes.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum pacote cadastrado ainda.</p>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">
            {pacotes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={`relacao-${p.id}`} className="min-w-0 text-sm font-medium">
                  {p.nome}
                </label>
                <select
                  id={`relacao-${p.id}`}
                  className={`${classeCampo} w-auto min-w-44`}
                  value={relacoes[p.id]}
                  onChange={(e) =>
                    setRelacoes((atual) => ({ ...atual, [p.id]: e.target.value as Relacao }))
                  }
                >
                  <option value="nenhuma">
                    {nenhumCompativel ? 'Pode comprar' : 'Não disponível'}
                  </option>
                  <option value="compativel">Só neste (compatível)</option>
                  <option value="incluso">Já vem incluso</option>
                </select>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            {nenhumCompativel
              ? 'Nenhum pacote marcado como compatível: o opcional pode ser comprado em todos (menos onde já vem incluso).'
              : 'Só pode ser comprado nos pacotes marcados como compatíveis.'}
          </p>
        </div>
      )}
      <div className="space-y-1 border-t pt-4">
        <p className="text-sm font-medium">Tipos de festa</p>
        <p className="text-muted-foreground text-xs">
          Nenhum marcado = vale para todos os tipos de festa.
        </p>
        {tipos.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum tipo de festa cadastrado.</p>
        ) : (
          <div className="grid gap-x-4 sm:grid-cols-2">
            {tipos.map((t) => (
              <CampoCheck
                key={t.id}
                id={`opcional-tipo-${t.id}`}
                rotulo={t.nome}
                checked={tiposSel.includes(t.id)}
                onChange={(e) =>
                  setTiposSel((atual) =>
                    e.target.checked ? [...atual, t.id] : atual.filter((x) => x !== t.id),
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </Secao>
  );
}
