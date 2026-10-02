import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { LinhaDoLink } from '@/components/app/divulgacao/linha-do-link';
import { QrCodigo } from '@/components/app/divulgacao/qr-codigo';
import { TextosProntos } from '@/components/app/divulgacao/textos-prontos';
import { BotaoLinkNaBio } from '@/components/app/onboarding/botao-link-na-bio';
import { textosProntos } from '@/domain/divulgacao/textos';
import { linkComOrigem, ORIGENS_DIVULGACAO } from '@/domain/publico/origem';
import { exigirSessao } from '@/server/auth/sessao';
import { empresas } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { urlDoSite } from '@/server/env';

export const metadata: Metadata = { title: 'Link e divulgação' };

/** Link do buffet para divulgar: links por origem, textos prontos, QR code e "Testar como cliente". */
export default async function PaginaLink() {
  const usuario = await exigirSessao();
  const base = `${urlDoSite() ?? ''}/b/${usuario.empresa.slug}`;
  const [empresa] = await comUsuario(usuario.id, (tx) =>
    tx
      .select({ cidade: empresas.cidade, linkNaBioEm: empresas.linkNaBioEm })
      .from(empresas)
      .where(eq(empresas.id, usuario.empresa.id)),
  );
  const textos = textosProntos({ nome: usuario.empresa.nome, link: base, cidade: empresa?.cidade });
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
          Use um link para cada lugar e veja em Números de onde vêm os seus leads.
        </p>
        <ul className="mt-3 flex flex-col gap-3" data-testid="links-por-origem">
          {ORIGENS_DIVULGACAO.map((o) => (
            <li key={o.origem}>
              <p className="mb-1 text-sm font-semibold">{o.rotulo}</p>
              <LinhaDoLink link={linkComOrigem(base, o.origem)} />
            </li>
          ))}
        </ul>
        {usuario.perfil === 'dono' && (
          <div className="mt-4">
            <BotaoLinkNaBio feito={!!empresa?.linkNaBioEm} />
          </div>
        )}
      </section>

      <section className="bg-card rounded-card border p-4 sm:p-5">
        <h2 className="text-lg font-bold">QR code</h2>
        <div className="mt-3">
          <QrCodigo link={linkComOrigem(base, 'qrcode')} />
        </div>
      </section>

      <section className="bg-card rounded-card border p-4 sm:p-5">
        <h2 className="text-lg font-bold">Textos prontos</h2>
        <p className="text-muted-foreground mt-1 mb-4 text-sm">
          Copie e cole no Instagram e no WhatsApp Business. Cada texto já leva o link certo.
        </p>
        <TextosProntos textos={textos} />
      </section>
    </div>
  );
}
