import type { Metadata } from 'next';
import { ORIGENS_DIVULGACAO } from '@/domain/publico/origem';
import { exigirSessao } from '@/server/auth/sessao';
import { urlDoSite } from '@/server/env';
import { LinhaDoLink } from './linha-do-link';

export const metadata: Metadata = { title: 'Link e divulgação' };

/** Link do buffet para divulgar, com variações por origem e o "Testar como cliente". */
export default async function PaginaLink() {
  const usuario = await exigirSessao();
  const base = `${urlDoSite() ?? ''}/b/${usuario.empresa.slug}`;
  return (
    <div className="flex flex-col gap-6">
      <section className="bg-card rounded-card border p-4 sm:p-5">
        <h2 className="text-lg font-bold">Seu link</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Divulgue este endereço: o cliente monta o orçamento sozinho e você recebe o lead aqui.
        </p>
        <div className="mt-3">
          <LinhaDoLink link={base} principal />
        </div>
        <a
          href={`/b/${usuario.empresa.slug}`}
          target="_blank"
          rel="noopener"
          className="bg-primary text-primary-foreground rounded-control mt-4 inline-flex min-h-11 items-center justify-center px-4 font-semibold"
          data-testid="testar-como-cliente"
        >
          Testar como cliente
        </a>
        <p className="text-muted-foreground mt-2 text-sm">
          Logado, você vê o link em <strong>modo teste</strong>: nada conta nas métricas, o lead
          fica marcado como teste e a pré-reserva é só simulada.
        </p>
      </section>

      <section className="bg-card rounded-card border p-4 sm:p-5">
        <h2 className="text-lg font-bold">Links por canal</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Use um link para cada lugar e saiba de onde vêm os seus leads.
        </p>
        <ul className="mt-3 flex flex-col gap-3">
          {ORIGENS_DIVULGACAO.map((o) => (
            <li key={o.origem}>
              <p className="mb-1 text-sm font-semibold">{o.rotulo}</p>
              <LinhaDoLink link={`${base}?origem=${o.origem}`} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
