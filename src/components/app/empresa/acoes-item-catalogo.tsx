'use client';

import { Copy, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { DialogoConfirmacao } from '@/components/app/acoes/dialogo-confirmacao';
import { MenuAcoes } from '@/components/app/acoes/menu-acoes';
import { useToast } from '@/components/app/toast';
import type { ResultadoAcao } from '@/server/actions/empresa/comum';

/** Menu secundário do editor: duplicar e excluir (com confirmação). */
export function AcoesItemCatalogo({
  id,
  nome,
  nomeItem,
  onDuplicar,
  onExcluir,
  hrefBase,
  emUso = false,
}: {
  /** usado em orçamentos: sem "Excluir" (o banco recusa; só desativar) */
  emUso?: boolean;
  id: string;
  nome: string;
  nomeItem: 'pacote' | 'opcional';
  onDuplicar: (id: string) => Promise<ResultadoAcao<{ id: string }>>;
  onExcluir: (id: string) => Promise<ResultadoAcao>;
  /** Ex.: "/app/empresa/catalogo/pacotes" (a cópia abre em `${hrefBase}/${id}`). */
  hrefBase: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [executando, iniciar] = useTransition();

  return (
    <>
      <MenuAcoes
        rotulo={`Mais ações: ${nome}`}
        acoes={[
          {
            rotulo: 'Duplicar',
            icone: Copy,
            onSelecionar: () =>
              iniciar(async () => {
                const r = await onDuplicar(id);
                if (r.ok && r.dados) {
                  toast.sucesso(r.mensagem);
                  router.push(`${hrefBase}/${r.dados.id}`);
                } else if (!r.ok) toast.erro(r.erro);
              }),
          },
          ...(emUso
            ? []
            : [
                {
                  rotulo: 'Excluir',
                  icone: Trash2,
                  perigosa: true,
                  onSelecionar: () => setConfirmando(true),
                },
              ]),
        ]}
      />
      <DialogoConfirmacao
        aberto={confirmando}
        onAbertoChange={setConfirmando}
        titulo={`Excluir o ${nomeItem} ${nome}?`}
        executando={executando}
        onConfirmar={() =>
          iniciar(async () => {
            const r = await onExcluir(id);
            if (r.ok) {
              toast.sucesso(r.mensagem);
              router.push('/app/empresa/catalogo');
            } else toast.erro(r.erro);
          })
        }
      />
    </>
  );
}
