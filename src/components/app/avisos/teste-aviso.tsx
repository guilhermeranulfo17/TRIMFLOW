'use client';

import { Send } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enviarAvisoTeste, type ResultadoTeste } from '@/server/actions/avisos';

const CANAL = { painel: 'Painel', push: 'Celular', whatsapp: 'WhatsApp' } as const;

function explicar(r: ResultadoTeste[number]): { texto: string; ok: boolean } {
  if (r.status === 'enviado') return { texto: 'Enviado', ok: true };
  if (r.status === 'desligado') {
    return {
      texto: r.canal === 'push' ? 'Nenhum aparelho ativado' : 'Desligado nas suas preferências',
      ok: false,
    };
  }
  const motivos: Record<string, string> = {
    CANAL_DESLIGADO: 'Canal ainda não configurado no Orkestra',
    SEM_INSCRICAO: 'Nenhum aparelho ativo',
    SEM_NUMERO: 'Número não confirmado',
    SEM_MODELO: 'Sem modelo aprovado',
  };
  const texto =
    (r.erro && motivos[r.erro]) ??
    (r.erro ? `Não saiu (${r.erro}). Vamos tentar de novo.` : r.status);
  return { texto, ok: false };
}

/** Envia um aviso de teste e mostra o resultado de cada canal. */
export function TesteAviso() {
  const [resultado, setResultado] = useState<ResultadoTeste | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [executando, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={executando}
        onClick={() =>
          iniciar(async () => {
            const r = await enviarAvisoTeste();
            if (r.ok) {
              setResultado(r.dados ?? []);
              setErro(null);
            } else setErro(r.erro);
          })
        }
      >
        <Send aria-hidden />
        Enviar aviso de teste
      </Button>
      {erro && <p className="text-destructive text-sm">{erro}</p>}
      {resultado && (
        <ul className="divide-y text-sm" data-testid="resultado-teste">
          {resultado.map((r) => {
            const e = explicar(r);
            return (
              <li
                key={r.canal}
                className="flex items-center justify-between gap-2 py-2"
                data-canal={r.canal}
              >
                <span className="font-semibold">{CANAL[r.canal]}</span>
                <span className={cn(e.ok ? 'text-primary' : 'text-muted-foreground')}>
                  {e.texto}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
