'use client';

import { Copy, Eye, EyeOff, ImageIcon, Pencil, Star, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { DialogoConfirmacao } from '@/components/app/acoes/dialogo-confirmacao';
import { MenuAcoes } from '@/components/app/acoes/menu-acoes';
import { ListaOrdenavel } from '@/components/app/campos';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import type { ResultadoAcao } from '@/server/actions/empresa/comum';

export type CardCatalogo = {
  id: string;
  nome: string;
  ativo: boolean;
  resumo: string;
  destaque?: boolean;
  imagemUrl?: string | null;
  /** Aviso em destaque no card (ex.: "Sem preço"). */
  alerta?: string | null;
};

/**
 * Cards de pacotes ou opcionais: foto, nome, preço resumido e status. Desativar/ativar é a
 * ação principal do menu; duplicar e excluir (com confirmação) ficam no mesmo menu.
 */
export function CardsCatalogo({
  itens: itensIniciais,
  nomeItem,
  hrefEditar,
  comImagem = false,
  somenteLeitura,
  onAlternarAtivo,
  onDuplicar,
  onExcluir,
  onReordenar,
  emUso = [],
}: {
  itens: CardCatalogo[];
  /** ids usados em orçamentos: sem "Excluir" (só desativar) */
  emUso?: string[];
  nomeItem: 'pacote' | 'opcional';
  hrefEditar: (id: string) => string;
  comImagem?: boolean;
  somenteLeitura: boolean;
  onAlternarAtivo: (id: string, ativo: boolean) => Promise<ResultadoAcao>;
  onDuplicar: (id: string) => Promise<ResultadoAcao<{ id: string }>>;
  onExcluir: (id: string) => Promise<ResultadoAcao>;
  onReordenar: (ids: string[]) => Promise<ResultadoAcao>;
}) {
  const toast = useToast();
  const router = useRouter();
  const [itens, setItens] = useState(itensIniciais);
  const [excluindo, setExcluindo] = useState<CardCatalogo | null>(null);
  const [executando, iniciar] = useTransition();

  useEffect(() => setItens(itensIniciais), [itensIniciais]);

  const executar = (acao: () => Promise<ResultadoAcao<unknown>>, depois?: () => void) =>
    iniciar(async () => {
      const r = await acao();
      if (r.ok) {
        toast.sucesso(r.mensagem);
        depois?.();
        router.refresh();
      } else toast.erro(r.erro);
    });

  const reordenar = (novos: CardCatalogo[]) => {
    const anteriores = itens;
    setItens(novos);
    iniciar(async () => {
      const r = await onReordenar(novos.map((i) => i.id));
      if (!r.ok) {
        setItens(anteriores);
        toast.erro(r.erro);
      }
    });
  };

  return (
    <>
      <ListaOrdenavel
        itens={itens}
        chave={(i) => i.id}
        rotulo={(i) => i.nome}
        onReordenar={reordenar}
        disabled={somenteLeitura || executando}
      >
        {(item) => (
          <article
            className="rounded-card bg-card flex items-center gap-3 border p-3"
            data-testid={`card-${nomeItem}`}
            aria-label={item.nome}
          >
            {comImagem && (
              <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-md">
                {item.imagemUrl ? (
                  <Image src={item.imagemUrl} alt="" fill sizes="64px" className="object-cover" />
                ) : (
                  <ImageIcon
                    className="text-muted-foreground absolute inset-0 m-auto size-5"
                    aria-hidden
                  />
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                <Link href={hrefEditar(item.id)} className="break-words hover:underline">
                  {item.nome}
                </Link>
                {item.destaque && (
                  <Star className="fill-alerta text-alerta size-4" aria-label="Destaque" />
                )}
                {!item.ativo && (
                  <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                    Inativo
                  </span>
                )}
              </p>
              <p className="text-muted-foreground text-sm">{item.resumo}</p>
              {item.alerta && <p className="text-destructive text-xs font-medium">{item.alerta}</p>}
              {emUso.includes(item.id) && !somenteLeitura && (
                <p className="text-muted-foreground text-xs">
                  Usado em orçamentos: para tirar do link, desative.
                </p>
              )}
            </div>
            <Button asChild variant="ghost" size="icon">
              <Link
                href={hrefEditar(item.id)}
                aria-label={`${somenteLeitura ? 'Ver' : 'Editar'} ${item.nome}`}
              >
                <Pencil aria-hidden />
              </Link>
            </Button>
            {!somenteLeitura && (
              <MenuAcoes
                rotulo={`Mais ações: ${item.nome}`}
                acoes={[
                  {
                    rotulo: item.ativo ? 'Desativar' : 'Ativar',
                    icone: item.ativo ? EyeOff : Eye,
                    onSelecionar: () => executar(() => onAlternarAtivo(item.id, !item.ativo)),
                  },
                  {
                    rotulo: 'Duplicar',
                    icone: Copy,
                    onSelecionar: () => executar(() => onDuplicar(item.id)),
                  },
                  ...(emUso.includes(item.id)
                    ? []
                    : [
                        {
                          rotulo: 'Excluir',
                          icone: Trash2,
                          perigosa: true,
                          onSelecionar: () => setExcluindo(item),
                        },
                      ]),
                ]}
              />
            )}
          </article>
        )}
      </ListaOrdenavel>
      <DialogoConfirmacao
        aberto={excluindo !== null}
        onAbertoChange={(v) => !v && setExcluindo(null)}
        titulo={excluindo ? `Excluir o ${nomeItem} ${excluindo.nome}?` : ''}
        executando={executando}
        onConfirmar={() =>
          excluindo &&
          executar(
            () => onExcluir(excluindo.id),
            () => {
              setItens((atual) => atual.filter((i) => i.id !== excluindo.id));
              setExcluindo(null);
            },
          )
        }
      />
    </>
  );
}
