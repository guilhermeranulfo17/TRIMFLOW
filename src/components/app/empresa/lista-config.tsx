'use client';

import { Eye, EyeOff, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { DialogoConfirmacao } from '@/components/app/acoes/dialogo-confirmacao';
import { MenuAcoes, type AcaoMenu } from '@/components/app/acoes/menu-acoes';
import { ListaOrdenavel } from '@/components/app/campos';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import type { ResultadoAcao } from '@/server/actions/empresa/comum';

type ItemBase = { id: string; ativo: boolean };

/**
 * Lista de cadastros simples (espaços, turnos, tipos de festa): cada item é um card com
 * resumo, editar inline, ativar/desativar, subir/descer e excluir (no menu, com confirmação).
 */
export function ListaConfig<T extends ItemBase>({
  itens: itensIniciais,
  nomeItem,
  rotulo,
  resumo,
  somenteLeitura,
  textoAdicionar,
  vazio,
  renderForm,
  onExcluir,
  onReordenar,
  onAlternarAtivo,
}: {
  itens: T[];
  /** "espaço", "turno": usado nas mensagens. */
  nomeItem: string;
  rotulo: (item: T) => string;
  resumo: (item: T) => React.ReactNode;
  somenteLeitura: boolean;
  textoAdicionar: string;
  vazio: React.ReactNode;
  renderForm: (item: T | null, fechar: () => void) => React.ReactNode;
  onExcluir: (id: string) => Promise<ResultadoAcao>;
  onReordenar: (ids: string[]) => Promise<ResultadoAcao>;
  onAlternarAtivo: (item: T) => Promise<ResultadoAcao<unknown>>;
}) {
  const toast = useToast();
  const [itens, setItens] = useState(itensIniciais);
  const [aberto, setAberto] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<T | null>(null);
  const [executando, iniciar] = useTransition();

  useEffect(() => setItens(itensIniciais), [itensIniciais]);

  const executar = (acao: () => Promise<ResultadoAcao<unknown>>, depois?: () => void) =>
    iniciar(async () => {
      const r = await acao();
      if (r.ok) {
        toast.sucesso(r.mensagem);
        depois?.();
      } else toast.erro(r.erro);
    });

  const reordenar = (novos: T[]) => {
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
    <div className="space-y-3">
      {itens.length === 0 && aberto !== 'novo' && vazio}
      <ListaOrdenavel
        itens={itens}
        chave={(i) => i.id}
        rotulo={rotulo}
        onReordenar={reordenar}
        disabled={somenteLeitura || executando || aberto !== null}
      >
        {(item) => {
          const estaAberto = aberto === item.id;
          const acoes: AcaoMenu[] = [
            {
              rotulo: item.ativo ? 'Desativar' : 'Ativar',
              icone: item.ativo ? EyeOff : Eye,
              onSelecionar: () => executar(() => onAlternarAtivo(item)),
            },
            {
              rotulo: 'Excluir',
              icone: Trash2,
              perigosa: true,
              onSelecionar: () => setExcluindo(item),
            },
          ];
          return (
            <div
              className="rounded-card bg-card border p-3"
              data-testid={`item-${nomeItem}`}
              aria-label={rotulo(item)}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className="break-words">{rotulo(item)}</span>
                    {!item.ativo && (
                      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                        Inativo
                      </span>
                    )}
                  </p>
                  <div className="text-muted-foreground mt-0.5 text-sm">{resumo(item)}</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${estaAberto ? 'Fechar' : somenteLeitura ? 'Ver' : 'Editar'} ${rotulo(item)}`}
                  aria-expanded={estaAberto}
                  onClick={() => setAberto(estaAberto ? null : item.id)}
                >
                  {estaAberto ? <X aria-hidden /> : <Pencil aria-hidden />}
                </Button>
                {!somenteLeitura && (
                  <MenuAcoes rotulo={`Mais ações: ${rotulo(item)}`} acoes={acoes} />
                )}
              </div>
              {estaAberto && (
                <div className="mt-3 border-t pt-3">{renderForm(item, () => setAberto(null))}</div>
              )}
            </div>
          );
        }}
      </ListaOrdenavel>

      {aberto === 'novo' && (
        <div className="rounded-card bg-card border p-3">
          <p className="mb-3 font-semibold">{textoAdicionar}</p>
          {renderForm(null, () => setAberto(null))}
        </div>
      )}

      {!somenteLeitura && aberto !== 'novo' && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setAberto('novo')}
        >
          <Plus aria-hidden />
          {textoAdicionar}
        </Button>
      )}

      <DialogoConfirmacao
        aberto={excluindo !== null}
        onAbertoChange={(v) => !v && setExcluindo(null)}
        titulo={excluindo ? `Excluir o ${nomeItem} ${rotulo(excluindo)}?` : ''}
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
    </div>
  );
}
