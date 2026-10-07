'use client';

import { MessageCircle, Phone, UserRound } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Folha } from '@/components/app/agenda/folha';
import { useToast } from '@/components/app/toast';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { registrarContato } from '@/server/actions/leads';

const CANAIS = [
  { valor: 'whatsapp', rotulo: 'WhatsApp', Icone: MessageCircle },
  { valor: 'ligacao', rotulo: 'Ligação', Icone: Phone },
  { valor: 'presencial', rotulo: 'Pessoalmente', Icone: UserRound },
] as const;

/**
 * "Registrar contato": escolher o canal registra na hora (atualização otimista no cartão via
 * onOtimista); se o servidor recusar, volta e mostra o motivo.
 */
export function BotaoRegistrarContato({
  leadId,
  onOtimista,
  onVolta,
  className,
}: {
  leadId: string;
  onOtimista?: () => void;
  onVolta?: () => void;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={cn(
          'bg-accent hover:bg-input inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold',
          className,
        )}
      >
        Registrar contato
      </button>
      <FolhaRegistrarContato
        leadId={leadId}
        aberto={aberto}
        onAbertoChange={setAberto}
        onOtimista={onOtimista}
        onVolta={onVolta}
      />
    </>
  );
}

/** A folha do "Registrar contato" (também aberta pelo funil ao mover o card). */
export function FolhaRegistrarContato({
  leadId,
  aberto,
  onAbertoChange: setAberto,
  onOtimista,
  onVolta,
  onOk,
}: {
  leadId: string;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  onOtimista?: () => void;
  onVolta?: () => void;
  onOk?: () => void;
}) {
  const toast = useToast();
  const [resumo, setResumo] = useState('');
  const [, iniciar] = useTransition();

  function registrar(canal: (typeof CANAIS)[number]['valor']) {
    setAberto(false);
    onOtimista?.();
    iniciar(async () => {
      const r = await registrarContato(leadId, { canal, resumo });
      if (r.ok) {
        toast.sucesso(r.mensagem);
        setResumo('');
        onOk?.();
      } else {
        onVolta?.();
        toast.erro(r.erro);
      }
    });
  }

  return (
    <>
      <Folha
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo="Registrar contato"
        descricao="Você falou com o cliente agora. Como foi?"
      >
        <div className="flex flex-col gap-3">
          <Textarea
            aria-label="Resumo da conversa (opcional)"
            placeholder="Resumo da conversa (opcional)"
            rows={2}
            maxLength={500}
            value={resumo}
            onChange={(e) => setResumo(e.target.value)}
          />
          <div className="grid grid-cols-3 gap-2">
            {CANAIS.map(({ valor, rotulo, Icone }) => (
              <button
                key={valor}
                type="button"
                onClick={() => registrar(valor)}
                className="rounded-card hover:bg-accent flex min-h-16 flex-col items-center justify-center gap-1 border text-sm font-semibold"
              >
                <Icone className="size-5" aria-hidden />
                {rotulo}
              </button>
            ))}
          </div>
        </div>
      </Folha>
    </>
  );
}
