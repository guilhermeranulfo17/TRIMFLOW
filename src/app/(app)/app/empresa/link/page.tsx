import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { LinhaDoLink } from '@/components/app/divulgacao/linha-do-link';
import { QrCodigo } from '@/components/app/divulgacao/qr-codigo';
import { TextosProntos } from '@/components/app/divulgacao/textos-prontos';
import { BotaoLinkNaBio } from '@/components/app/onboarding/botao-link-na-bio';
import { FormTextosPagina } from '@/components/app/pagina/form-textos';
import { PreviaPagina, ProvedorPrevia } from '@/components/app/pagina/previa';
import { SecaoGaleria } from '@/components/app/pagina/secao-galeria';
import { SecaoDepoimentos, SecaoPerguntas } from '@/components/app/pagina/secao-lista';
import { textosProntos } from '@/domain/divulgacao/textos';
import { perguntasAutomaticas } from '@/domain/publico/pagina';
import { linkComOrigem, ORIGENS_DIVULGACAO } from '@/domain/publico/origem';
import { exigirSessao } from '@/server/auth/sessao';
import { empresas } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { urlDoSite } from '@/server/env';
import { carregarEditorPagina } from '@/server/pagina/carregar';
import { carregarVitrine } from '@/server/publico/carregar';

export const metadata: Metadata = { title: 'Link e divulgação' };

/**
 * Link do buffet: "Testar como cliente", editor da página pública com prévia (só o dono), links
 * por origem, QR code e textos prontos.
 */
export default async function PaginaLink() {
  const usuario = await exigirSessao();
  const dono = usuario.perfil === 'dono';
  const slug = usuario.empresa.slug;
  const base = `${urlDoSite() ?? ''}/b/${slug}`;
  // uma transação para a tela; a vitrine (perguntas automáticas) vem do cache do link público
  const [[empresa, editor], vitrine] = await Promise.all([
    comUsuario(usuario.id, (tx) =>
      Promise.all([
        tx
          .select({ cidade: empresas.cidade, linkNaBioEm: empresas.linkNaBioEm })
          .from(empresas)
          .where(eq(empresas.id, usuario.empresa.id))
          .then((l) => l[0]),
        dono ? carregarEditorPagina(usuario, tx) : null,
      ]),
    ),
    dono ? carregarVitrine(slug).catch(() => null) : null,
  ]);
  const textos = textosProntos({ nome: usuario.empresa.nome, link: base, cidade: empresa?.cidade });
  const automaticas = vitrine
    ? perguntasAutomaticas(vitrine.vitrine, {
        prazoPreReservaHoras: vitrine.contexto.prazoPreReservaHoras,
      })
    : [];
  return (
    <div className="flex flex-col gap-6" data-tela-larga={dono || undefined}>
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

      {editor && (
        <ProvedorPrevia>
          <section id="pagina" aria-labelledby="titulo-pagina" className="scroll-mt-20">
            <h2 id="titulo-pagina" className="text-lg font-bold">
              Personalize sua página
            </h2>
            <p className="text-muted-foreground mt-1 mb-4 text-sm">
              Cada seção salva sozinha e a prévia mostra a página como o cliente vê. Seção vazia não
              aparece no link.
            </p>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
              <div className="flex min-w-0 flex-col gap-6">
                <FormTextosPagina inicial={editor.textos} segmento={editor.segmento} />
                <SecaoGaleria
                  empresaId={usuario.empresa.id}
                  nomeBuffet={usuario.empresa.nome}
                  inicial={editor.galeria}
                />
                <SecaoDepoimentos inicial={editor.depoimentos} />
                <SecaoPerguntas inicial={editor.perguntas} automaticas={automaticas} />
              </div>
              <PreviaPagina slug={slug} />
            </div>
          </section>
        </ProvedorPrevia>
      )}

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
        {dono && (
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
