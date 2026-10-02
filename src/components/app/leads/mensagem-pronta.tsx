'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Folha } from '@/components/app/agenda/folha';
import { useToast } from '@/components/app/toast';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { Textarea } from '@/components/ui/textarea';
import {
  ROTULO_SITUACAO,
  SITUACOES_MENSAGEM,
  type SituacaoMensagem,
} from '@/domain/leads/mensagens';
import { cn } from '@/lib/utils';
import { prepararMensagem, registrarMensagem } from '@/server/actions/leads';

/**
 * Botão WhatsApp com mensagem pronta: abre um sheet com o texto do momento (editável), o
 * vendedor pode trocar a situação e só então abre a conversa. Nada é enviado sozinho.
 */
export function BotaoWhatsApp({
  leadId,
  tarefaId,
  textoInicial,
  className,
  rotulo = 'WhatsApp',
  situacaoInicial,
}: {
  leadId: string;
  tarefaId?: string;
  /** mensagem sugerida de uma tarefa (vence a do momento) */
  textoInicial?: string | null;
  className?: string;
  rotulo?: string;
  /** situação da tarefa automática (mensagem pronta da regra) */
  situacaoInicial?: SituacaoMensagem;
}) {
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [situacao, setSituacao] = useState<SituacaoMensagem | null>(null);
  const [texto, setTexto] = useState('');
  const [numero, setNumero] = useState('');

  async function carregar(s?: SituacaoMensagem) {
    setCarregando(true);
    const r = await prepararMensagem(leadId, s);
    setCarregando(false);
    if (!r.ok || !r.dados) {
      toast.erro(r.ok ? 'Não foi possível montar a mensagem.' : r.erro);
      return;
    }
    setSituacao(r.dados.situacao);
    setNumero(r.dados.numero);
    setTexto(s || !textoInicial ? r.dados.texto : textoInicial);
  }

  useEffect(() => {
    if (aberto && !numero) void carregar(situacaoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega só ao abrir
  }, [aberto]);

  const href = numero ? `${numero}?text=${encodeURIComponent(texto)}` : '#';

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={cn(
          'bg-primary text-primary-foreground hover:bg-primary-hover inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold',
          className,
        )}
      >
        <IconeWhatsApp className="size-4" />
        {rotulo}
      </button>
      <Folha
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo="Mensagem para o WhatsApp"
        descricao="Confira, ajuste se quiser e abra a conversa."
      >
        <div className="flex flex-col gap-3" data-testid="mensagem-pronta">
          <div className="-mx-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Situação">
            {SITUACOES_MENSAGEM.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={situacao === s}
                onClick={() => void carregar(s)}
                className={cn(
                  'min-h-9 rounded-full border px-3 text-xs font-semibold',
                  situacao === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-accent',
                )}
              >
                {ROTULO_SITUACAO[s]}
              </button>
            ))}
          </div>
          {carregando && !texto ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Montando a mensagem…
            </p>
          ) : (
            <Textarea
              aria-label="Texto da mensagem"
              rows={7}
              maxLength={1500}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          )}
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!numero || !texto.trim()}
            onClick={(e) => {
              if (!numero || !texto.trim()) {
                e.preventDefault();
                return;
              }
              if (situacao) void registrarMensagem(leadId, situacao, tarefaId ?? null);
              setAberto(false);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-4 font-bold aria-disabled:opacity-50"
            data-testid="abrir-whatsapp"
          >
            <IconeWhatsApp />
            Abrir WhatsApp
          </a>
        </div>
      </Folha>
    </>
  );
}
