'use client';

import { useState, useTransition } from 'react';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mascaraTelefoneBR } from '@/domain/mascara';
import { ativarWhatsapp, desativarWhatsapp } from '@/server/actions/avisos';

/** Avisos no WhatsApp do próprio usuário: confirmar o número e aceitar (data do aceite fica salva). */
export function WhatsappAvisos({
  ativo,
  numero,
  aceiteEm,
  configurado,
}: {
  ativo: boolean;
  numero: string | null;
  aceiteEm: string | null;
  configurado: boolean;
}) {
  const toast = useToast();
  const [valor, setValor] = useState('');
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [executando, iniciar] = useTransition();

  return (
    <div className="flex flex-col gap-3" data-testid="whatsapp-avisos">
      {!configurado && (
        <p className="text-muted-foreground text-sm">
          O WhatsApp oficial ainda não foi ligado no Orkestra. Você já pode deixar seu número
          pronto: os avisos começam a chegar quando ele for ativado.
        </p>
      )}
      {ativo ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            Ligado para <strong>{numero}</strong>
            {aceiteEm && <span className="text-muted-foreground"> · aceite em {aceiteEm}</span>}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={executando}
            onClick={() =>
              iniciar(async () => {
                const r = await desativarWhatsapp();
                if (r.ok) toast.sucesso(r.mensagem);
                else toast.erro(r.erro);
              })
            }
          >
            Desligar
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              const r = await ativarWhatsapp(valor, aceite);
              if (r.ok) {
                setErro(null);
                toast.sucesso(r.mensagem);
              } else {
                setErro(r.erro);
                toast.erro(r.erro);
              }
            });
          }}
        >
          <label className="text-sm font-semibold" htmlFor="whatsapp-avisos-numero">
            Seu WhatsApp
          </label>
          <Input
            id="whatsapp-avisos-numero"
            inputMode="tel"
            placeholder="(34) 99135-5450"
            value={valor}
            onChange={(e) => setValor(mascaraTelefoneBR(e.target.value))}
            aria-invalid={!!erro || undefined}
            className="max-w-xs"
          />
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="accent-primary mt-0.5 size-5"
              checked={aceite}
              onChange={(e) => setAceite(e.target.checked)}
            />
            Aceito receber os avisos do Orkestra neste número (pré-reservas, visitas e o resumo do
            dia). Posso desligar quando quiser.
          </label>
          <Button
            type="submit"
            disabled={executando || !aceite || valor.length < 14}
            className="self-start"
          >
            Ligar WhatsApp
          </Button>
        </form>
      )}
    </div>
  );
}
