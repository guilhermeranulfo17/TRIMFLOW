'use client';

import { UserCheck, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { DialogoConfirmacao } from '@/components/app/acoes/dialogo-confirmacao';
import { CampoPercentual } from '@/components/app/campos';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { formatPhoneBR } from '@/domain/phone';
import { definirAtivoUsuario, salvarLimiteDesconto } from '@/server/actions/empresa/usuarios';

export type UsuarioLista = {
  id: string;
  nome: string;
  email: string;
  whatsappE164: string | null;
  perfil: 'dono' | 'vendedor';
  ativo: boolean;
  limiteDescontoBp: number;
};

function Limite({ usuario }: { usuario: UsuarioLista }) {
  const toast = useToast();
  const [valor, setValor] = useState<number | null>(usuario.limiteDescontoBp);
  const [salvando, iniciar] = useTransition();
  const mudou = valor !== usuario.limiteDescontoBp;
  const id = `limite-${usuario.id}`;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label htmlFor={id} className="text-muted-foreground block text-xs">
          Limite de desconto<span className="sr-only"> de {usuario.nome}</span>
        </label>
        <CampoPercentual id={id} valor={valor} onChange={setValor} className="w-24" />
      </div>
      {mudou && (
        <Button
          type="button"
          size="sm"
          disabled={salvando || valor === null}
          onClick={() =>
            iniciar(async () => {
              const r = await salvarLimiteDesconto(usuario.id, valor ?? Number.NaN);
              if (r.ok) toast.sucesso(r.mensagem);
              else toast.erro(r.erro);
            })
          }
        >
          Salvar limite
        </Button>
      )}
    </div>
  );
}

export function ListaUsuarios({
  usuarios,
  usuarioAtualId,
}: {
  usuarios: UsuarioLista[];
  usuarioAtualId: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [desativando, setDesativando] = useState<UsuarioLista | null>(null);
  const [executando, iniciar] = useTransition();

  const alterar = (u: UsuarioLista, ativo: boolean) =>
    iniciar(async () => {
      const r = await definirAtivoUsuario(u.id, ativo);
      if (r.ok) {
        toast.sucesso(r.mensagem);
        setDesativando(null);
        router.refresh();
      } else toast.erro(r.erro);
    });

  return (
    <>
      <ul className="space-y-3">
        {usuarios.map((u) => (
          <li
            key={u.id}
            className="rounded-card bg-card space-y-3 border p-4"
            data-testid="usuario"
            aria-label={u.nome}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="break-words">{u.nome}</span>
                  <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                    {u.perfil === 'dono' ? 'Dono' : 'Vendedor'}
                  </span>
                  {!u.ativo && (
                    <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                      Desativado
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground text-sm break-all">{u.email}</p>
                {u.whatsappE164 && (
                  <p className="text-muted-foreground text-sm">{formatPhoneBR(u.whatsappE164)}</p>
                )}
              </div>
              {u.id !== usuarioAtualId &&
                (u.ativo ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={executando}
                    onClick={() => setDesativando(u)}
                  >
                    <UserX aria-hidden />
                    Desativar
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={executando}
                    onClick={() => alterar(u, true)}
                  >
                    <UserCheck aria-hidden />
                    Reativar
                  </Button>
                ))}
            </div>
            {u.perfil === 'vendedor' ? (
              <Limite usuario={u} />
            ) : (
              <p className="text-muted-foreground text-xs">O dono não tem limite de desconto.</p>
            )}
          </li>
        ))}
      </ul>
      <DialogoConfirmacao
        aberto={desativando !== null}
        onAbertoChange={(v) => !v && setDesativando(null)}
        titulo={desativando ? `Desativar ${desativando.nome}?` : ''}
        descricao="A pessoa não consegue mais entrar no painel. Você pode reativar quando quiser."
        textoConfirmar="Desativar"
        executando={executando}
        onConfirmar={() => desativando && alterar(desativando, false)}
      />
    </>
  );
}
