import { CheckCircle2, Download, FileX2, MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { after } from 'next/server';
import { AssinarContrato } from '@/components/contrato/assinar-contrato';
import { TextoContrato } from '@/components/contrato/texto-contrato';
import { BannerTeste } from '@/components/publico/banner-teste';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/publico/marca';
import { RodapePublico } from '@/components/publico/rodape';
import { formatData, formatDataHora } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { linkWhatsApp } from '@/domain/publico/whatsapp';
import { carregarContratoPublico, registrarVisualizacao } from '@/server/contratos/carregar';
import { REGEX_TOKEN_CONTRATO } from '@/server/contratos/segredos';
import { ehModoTeste } from '@/server/publico/sessao';
import { hashIpDoVisitante } from '@/server/publico/seguranca';
import { exigirBuffet } from '../../buscar';

type Props = { params: Promise<{ slug: string; token: string }> };

export const metadata: Metadata = {
  title: 'Seu contrato',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

/** Contrato do cliente: ler, assinar ou pedir ajuste. Sem login, pelo link único. */
export default async function PaginaContrato({ params }: Props) {
  const { slug, token } = await params;
  const buffet = await exigirBuffet(slug);
  const [contrato, modoTeste] = await Promise.all([
    REGEX_TOKEN_CONTRATO.test(token)
      ? carregarContratoPublico(slug, token)
      : Promise.resolve({ estado: 'indisponivel' as const }),
    ehModoTeste(slug),
  ]);
  if (contrato.estado === 'aberto') {
    const ipHash = await hashIpDoVisitante();
    after(() => registrarVisualizacao(slug, token, modoTeste, ipHash));
  }

  const cabecalho = (
    <header className="flex items-center gap-3 border-b px-4 py-4">
      {buffet.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={buffet.logoUrl}
          alt=""
          width={48}
          height={48}
          className="size-12 shrink-0 rounded-full border object-cover"
        />
      )}
      <div className="min-w-0">
        <p className="font-titulo truncate text-lg font-extrabold">{buffet.nome}</p>
        <p className="text-muted-foreground text-sm">Contrato da sua festa</p>
      </div>
    </header>
  );
  const falarComBuffet = buffet.whatsappE164 && (
    <a
      href={linkWhatsApp(buffet.whatsappE164, 'Oi! Preciso de ajuda com o meu contrato.')}
      target="_blank"
      rel="noopener noreferrer"
      className={`${BOTAO_SECUNDARIO} mt-4 w-full`}
    >
      <IconeWhatsApp />
      Falar com o buffet
    </a>
  );

  return (
    <>
      {(modoTeste ||
        (contrato.estado !== 'indisponivel' && 'ehTeste' in contrato && contrato.ehTeste)) && (
        <BannerTeste />
      )}
      {cabecalho}
      <main className="mx-auto max-w-2xl px-4 pt-6 pb-4">
        {contrato.estado === 'indisponivel' && (
          <section
            className="rounded-card border p-6 text-center"
            data-testid="contrato-indisponivel"
          >
            <FileX2 className="text-muted-foreground mx-auto size-10" aria-hidden />
            <h1 className="mt-3 text-xl font-extrabold">Este link não está disponível</h1>
            <p className="text-muted-foreground mt-2">
              Ele pode ter vencido ou sido trocado por um contrato novo. Fale com o buffet para
              receber o link certo.
            </p>
            {falarComBuffet}
          </section>
        )}

        {contrato.estado === 'recusado' && (
          <section className="rounded-card border p-6 text-center" data-testid="contrato-recusado">
            <MessageCircle className="text-primary-texto mx-auto size-10" aria-hidden />
            <h1 className="mt-3 text-xl font-extrabold">Pedido de ajuste enviado</h1>
            <p className="text-muted-foreground mt-2">
              O {contrato.buffet} recebeu o seu pedido e vai falar com você. Se for preciso, um
              contrato novo chega por um link novo.
            </p>
            {falarComBuffet}
          </section>
        )}

        {contrato.estado === 'concluido' && (
          <section className="rounded-card border p-6 text-center" data-testid="contrato-concluido">
            <CheckCircle2 className="text-primary-texto mx-auto size-12" aria-hidden />
            <h1 className="mt-3 text-2xl font-extrabold">Contrato assinado</h1>
            <p className="text-muted-foreground mt-2">
              Contrato {contrato.codigo} com o {contrato.buffet}, assinado em{' '}
              {formatDataHora(contrato.concluidoEm)}. Guarde o PDF: ele traz o comprovante da
              assinatura.
            </p>
            <a
              href={`/b/${slug}/contrato/${token}/pdf`}
              className={`${BOTAO_PRINCIPAL} mt-5 w-full`}
              data-testid="baixar-pdf-contrato"
            >
              <Download className="size-5" aria-hidden />
              Baixar PDF
            </a>
          </section>
        )}

        {contrato.estado === 'aberto' && (
          <>
            <h1 className="text-2xl font-extrabold">Leia e assine o seu contrato</h1>
            <p className="text-muted-foreground mt-1">
              Contrato {contrato.codigo}
              {contrato.versao > 1 ? ` (versão ${contrato.versao})` : ''} · link válido até{' '}
              {formatData(contrato.expiraEm, contrato.fuso)}
            </p>

            <dl
              className="rounded-card bg-accent mt-4 grid grid-cols-2 gap-x-4 gap-y-3 p-4"
              data-testid="resumo-contrato"
            >
              {(
                [
                  ['Data', contrato.resumo.data ? formatData(contrato.resumo.data) : null],
                  ['Horário', contrato.resumo.horario],
                  [
                    'Convidados',
                    contrato.resumo.convidados ? String(contrato.resumo.convidados) : null,
                  ],
                  ['Espaço', contrato.resumo.espaco],
                  [
                    'Valor total',
                    contrato.resumo.totalCentavos !== null
                      ? formatBRL(contrato.resumo.totalCentavos)
                      : null,
                  ],
                  [
                    'Sinal',
                    contrato.resumo.sinalCentavos !== null
                      ? formatBRL(contrato.resumo.sinalCentavos)
                      : null,
                  ],
                ] as [string, string | null][]
              )
                .filter((l): l is [string, string] => !!l[1])
                .map(([r, v]) => (
                  <div key={r} className="min-w-0">
                    <dt className="text-muted-foreground text-sm">{r}</dt>
                    <dd className="font-semibold break-words">{v}</dd>
                  </div>
                ))}
            </dl>

            <article className="rounded-card mt-6 border p-4 sm:p-6" aria-label="Texto do contrato">
              <TextoContrato texto={contrato.texto} />
              <p className="text-muted-foreground mt-6 border-t pt-4 text-sm">
                Assinado pelo buffet: {contrato.buffetAssinatura.nome}
                {contrato.buffetAssinatura.representa
                  ? ` (${contrato.buffetAssinatura.representa})`
                  : ''}{' '}
                em {formatDataHora(contrato.buffetAssinatura.assinadoEm, contrato.fuso)}.
              </p>
            </article>

            <AssinarContrato
              slug={slug}
              token={token}
              hash={contrato.hash}
              exigeCodigo={contrato.exigeCodigo}
              emailMascarado={contrato.emailMascarado}
              modoTeste={modoTeste}
              buffet={contrato.buffet}
            />
          </>
        )}
      </main>
      <RodapePublico />
    </>
  );
}
