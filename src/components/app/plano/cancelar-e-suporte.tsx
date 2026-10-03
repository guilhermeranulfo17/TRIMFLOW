'use client';

import { useState, useTransition } from 'react';
import { classeCampo } from '@/components/app/form/estilos';
import { useToast } from '@/components/app/toast';
import { MOTIVOS_CANCELAMENTO } from '@/domain/cobranca/motivos-cancelamento';
import { cn } from '@/lib/utils';
import { cancelarPlano, definirAcessoSuporte } from '@/server/actions/cobranca';

/** Cancelar a assinatura: motivo obrigatório (lista + texto), sem oferta de pausa. */
export function CancelarAssinatura() {
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [texto, setTexto] = useState('');
  const [pendente, iniciar] = useTransition();

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-muted-foreground min-h-11 text-sm underline underline-offset-2"
        data-testid="abrir-cancelar"
      >
        Cancelar assinatura
      </button>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="form-cancelar"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await cancelarPlano({ motivo, texto: texto || null });
          if (r.ok) {
            toast.sucesso(r.mensagem);
            setAberto(false);
          } else toast.erro(r.campos?.texto ?? r.erro);
        });
      }}
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-semibold">Por que você está cancelando?</legend>
        {MOTIVOS_CANCELAMENTO.map((m) => (
          <label key={m.valor} className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="radio"
              name="motivo"
              value={m.valor}
              checked={motivo === m.valor}
              onChange={() => setMotivo(m.valor)}
              className="accent-primary size-5"
            />
            {m.rotulo}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm">
        Quer contar mais? {motivo === 'outro' ? '(obrigatório)' : '(opcional)'}
        <textarea
          className={cn(classeCampo, 'h-24 py-2')}
          value={texto}
          maxLength={1000}
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>
      <p className="text-muted-foreground text-xs">
        Você continua usando até o fim do período já pago. Depois, o painel fica somente leitura e o
        link mostra só a vitrine. Seus dados ficam guardados.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!motivo || pendente}
          className="rounded-control min-h-11 border border-red-400/40 bg-red-500/10 px-4 text-sm font-semibold text-red-200 disabled:opacity-60"
        >
          {pendente ? 'Cancelando…' : 'Confirmar cancelamento'}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded-control min-h-11 px-4 text-sm"
        >
          Voltar
        </button>
      </div>
    </form>
  );
}

/** Consentimento do dono para o suporte do Orkestra acessar a conta por 7 dias. */
export function AcessoSuporte({ ate }: { ate: string | null }) {
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const mudar = (permitir: boolean) =>
    iniciar(async () => {
      const r = await definirAcessoSuporte(permitir);
      if (r.ok) toast.sucesso(r.mensagem);
      else toast.erro(r.erro);
    });
  return (
    <div className="flex flex-col gap-3" data-testid="acesso-suporte">
      <p className="text-muted-foreground text-sm">
        Precisa de ajuda para configurar? Permita que a equipe do Orkestra entre na sua conta. Tudo
        o que o suporte fizer fica registrado, e o acesso termina sozinho em 7 dias.
      </p>
      {ate ? (
        <>
          <p className="text-sm">
            O suporte pode acessar até <strong>{ate}</strong>.
          </p>
          <button
            type="button"
            disabled={pendente}
            onClick={() => mudar(false)}
            className="rounded-control min-h-11 border px-4 text-sm font-semibold disabled:opacity-60"
          >
            Remover acesso do suporte
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={pendente}
          onClick={() => mudar(true)}
          className="rounded-control min-h-11 border px-4 text-sm font-semibold disabled:opacity-60"
          data-testid="permitir-suporte"
        >
          Permitir que o suporte acesse minha conta por 7 dias
        </button>
      )}
    </div>
  );
}
