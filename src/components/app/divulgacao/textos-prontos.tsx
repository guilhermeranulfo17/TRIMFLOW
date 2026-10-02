import type { TextoPronto } from '@/domain/divulgacao/textos';
import { BotaoCopiar } from './botao-copiar';

/** Textos prontos (bio, WhatsApp Business, post, status), cada um com Copiar. */
export function TextosProntos({ textos }: { textos: TextoPronto[] }) {
  return (
    <ul className="flex flex-col gap-4" data-testid="textos-prontos">
      {textos.map((t) => (
        <li key={t.chave} className="flex flex-col gap-2" data-testid={`texto-${t.chave}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{t.titulo}</p>
            <BotaoCopiar texto={t.texto} rotuloAcessivel={`Copiar: ${t.titulo}`} />
          </div>
          <p className="rounded-control bg-muted text-muted-foreground px-3 py-2 text-sm break-words whitespace-pre-line">
            {t.texto}
          </p>
        </li>
      ))}
    </ul>
  );
}
