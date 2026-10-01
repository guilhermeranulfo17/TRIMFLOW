'use client';

import { Lock } from 'lucide-react';
import { useState, useTransition } from 'react';
import { mascaraTelefoneBR } from '@/domain/mascara';
import type { Previa } from '@/domain/publico/previa';
import type { OrigemLead } from '@/domain/publico/tipos';
import { iniciarOrcamento } from '@/server/actions/publico';
import type { Contato, PropsPasso } from './tipos';

type Props = PropsPasso & {
  contato: Contato;
  setContato: (c: Contato) => void;
  inicio: string;
  origem: OrigemLead;
  confirmado: (previa: Previa) => void;
};

const CAMPO =
  'mt-1 h-12 w-full rounded-control border px-3 text-base focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive';

/** Passo 3: nome, WhatsApp e aceite. O lead nasce aqui; antes disso, nada pessoal sai do aparelho. */
export default function PassoContato({
  slug,
  escolhas,
  contato,
  setContato,
  inicio,
  origem,
  confirmado,
}: Props) {
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErro(null);
    iniciar(async () => {
      const r = await iniciarOrcamento(slug, {
        contato: { ...contato, aceite: contato.aceite as true, inicio },
        escolhas,
        origem,
      });
      if (r.ok) {
        confirmado(r.dados);
        return;
      }
      setErros(r.campos ?? {});
      setErro(r.erro);
    });
  }

  return (
    <form id="form-contato" onSubmit={enviar} noValidate aria-busy={enviando}>
      <p className="text-muted-foreground">
        Para ver os pacotes com os valores da sua festa, diga como falar com você.
      </p>
      <div className="mt-5 flex flex-col gap-4">
        <div>
          <label htmlFor="nome" className="font-semibold">
            Seu nome
          </label>
          <input
            id="nome"
            name="nome"
            autoComplete="name"
            value={contato.nome}
            onChange={(e) => setContato({ ...contato, nome: e.target.value })}
            aria-invalid={!!erros.nome}
            aria-describedby={erros.nome ? 'erro-nome' : undefined}
            className={CAMPO}
          />
          {erros.nome && (
            <p id="erro-nome" className="text-destructive mt-1 text-sm">
              {erros.nome}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="whatsapp" className="font-semibold">
            Seu WhatsApp
          </label>
          <input
            id="whatsapp"
            name="whatsapp"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(34) 99135-5450"
            value={contato.whatsapp}
            onChange={(e) =>
              setContato({ ...contato, whatsapp: mascaraTelefoneBR(e.target.value) })
            }
            aria-invalid={!!erros.whatsapp}
            aria-describedby={erros.whatsapp ? 'erro-whatsapp' : undefined}
            className={CAMPO}
          />
          {erros.whatsapp && (
            <p id="erro-whatsapp" className="text-destructive mt-1 text-sm">
              {erros.whatsapp}
            </p>
          )}
        </div>
        {/* Campo invisível para pessoas (robôs preenchem). */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="site">Não preencha</label>
          <input
            id="site"
            name="site"
            tabIndex={-1}
            autoComplete="off"
            value={contato.site}
            onChange={(e) => setContato({ ...contato, site: e.target.value })}
          />
        </div>
        <label className="flex min-h-12 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={contato.aceite}
            onChange={(e) => setContato({ ...contato, aceite: e.target.checked })}
            className="accent-primary mt-0.5 size-6 shrink-0"
            aria-invalid={!!erros.aceite}
          />
          <span className="text-sm">
            Autorizo o buffet a usar meu nome e WhatsApp para enviar este orçamento e falar comigo
            sobre a festa. Li a{' '}
            <a
              href="/privacidade"
              target="_blank"
              className="font-semibold underline underline-offset-2"
            >
              Política de Privacidade
            </a>
            .
          </span>
        </label>
        {erros.aceite && <p className="text-destructive -mt-2 text-sm">{erros.aceite}</p>}
      </div>
      {erro && (
        <p role="alert" className="text-destructive mt-4 font-semibold">
          {erro}
        </p>
      )}
      <p className="text-muted-foreground mt-6 flex items-center gap-2 text-sm">
        <Lock className="size-4 shrink-0" aria-hidden />
        Seus dados vão só para o buffet. Nada de spam.
      </p>
    </form>
  );
}
