'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAvisoAlteracoes } from '../use-aviso-alteracoes';

/**
 * Uma seção de configuração com o próprio botão Salvar (nunca um botão global).
 * Em modo leitura (vendedor), os campos ficam desabilitados e o botão some.
 */
export function Secao({
  titulo,
  descricao,
  onSubmit,
  salvando = false,
  sujo = false,
  somenteLeitura = false,
  textoBotao = 'Salvar',
  acoesExtras,
  children,
  id,
}: {
  titulo: string;
  descricao?: string;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  salvando?: boolean;
  sujo?: boolean;
  somenteLeitura?: boolean;
  textoBotao?: string;
  acoesExtras?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  useAvisoAlteracoes(sujo && !somenteLeitura);
  const conteudo = (
    <fieldset disabled={somenteLeitura || salvando} className="min-w-0 space-y-4">
      {children}
    </fieldset>
  );
  return (
    <Card id={id} className="gap-4">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-bold">{titulo}</h2>
        </CardTitle>
        {descricao && <CardDescription>{descricao}</CardDescription>}
      </CardHeader>
      <CardContent>
        {onSubmit ? (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {conteudo}
            {!somenteLeitura && (
              <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
                {sujo && (
                  <span className="text-muted-foreground mr-auto text-xs">
                    Alterações não salvas
                  </span>
                )}
                {acoesExtras}
                <Button type="submit" disabled={salvando} className="min-w-28">
                  {salvando && <Loader2 className="animate-spin" aria-hidden />}
                  {salvando ? 'Salvando…' : textoBotao}
                </Button>
              </div>
            )}
          </form>
        ) : (
          conteudo
        )}
      </CardContent>
    </Card>
  );
}
