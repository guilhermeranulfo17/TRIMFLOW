import { RefreshCw, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { after } from 'next/server';
import { formatData } from '@/domain/dates';
import { BannerTeste } from '@/components/publico/banner-teste';
import { PropostaWeb, RodapeProposta } from '@/components/proposta/proposta-web';
import { carregarPropostaPublica, registrarAbertura } from '@/server/proposta/carregar';
import { ehModoTeste } from '@/server/publico/sessao';
import { hashIpDoVisitante } from '@/server/publico/seguranca';
import { exigirBuffet } from '../../buscar';
import { AcoesProposta } from './acoes';

type Props = {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: 'Sua proposta',
  robots: { index: false, follow: false },
};

/** Proposta congelada, sempre na versão vigente (token antigo redireciona com aviso). */
export default async function PaginaProposta({ params, searchParams }: Props) {
  const { slug, token } = await params;
  const busca = await searchParams;
  await exigirBuffet(slug);
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) notFound();
  const [proposta, modoTeste] = await Promise.all([
    carregarPropostaPublica(slug, token),
    ehModoTeste(slug),
  ]);
  if (!proposta) notFound();
  if (proposta.meta.tokenAntigo)
    redirect(`/b/${slug}/proposta/${proposta.meta.token}?atualizada=1`);

  // Rastreio: abertura pelo cliente (o próprio usuário da empresa não conta). Depois da
  // resposta (after): a proposta não espera a gravação.
  const ipHash = await hashIpDoVisitante();
  after(() => registrarAbertura(slug, token, modoTeste, ipHash));

  const { modelo: m, versao: v, meta } = proposta;
  const expirada = m.validade.expirada || v.status === 'expirado';

  return (
    <>
      {(modoTeste || meta.ehTeste) && <BannerTeste />}
      <main className="mx-auto max-w-2xl px-4 pt-4 pb-4 sm:pt-6">
        {busca.atualizada === '1' && meta.atualizadaEm && (
          <p
            role="status"
            className="rounded-card mb-4 flex items-center gap-2 border border-sky-300 bg-sky-50 p-3 text-sm font-semibold text-sky-900"
            data-testid="aviso-atualizada"
          >
            <RefreshCw className="size-4 shrink-0" aria-hidden />
            Esta proposta foi atualizada em {formatData(meta.atualizadaEm)}.
          </p>
        )}
        {expirada && (
          <p
            role="alert"
            className="rounded-card mb-4 flex items-center gap-2 border border-amber-400 bg-amber-50 p-3 text-sm font-semibold text-amber-900"
            data-testid="aviso-expirada"
          >
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            {m.validade.texto}. Os valores podem ter mudado.
          </p>
        )}

        <PropostaWeb modelo={m} />

        <AcoesProposta
          slug={slug}
          token={meta.token}
          buffet={{ nome: proposta.buffet.nome, whatsappE164: proposta.buffet.whatsappE164 }}
          estado={
            expirada
              ? 'expirada'
              : meta.reserva
                ? 'reservada'
                : meta.suspenso
                  ? 'suspensa'
                  : 'aberta'
          }
          expiraEm={meta.reserva?.expiraEm ?? null}
          hoje={v.hoje}
          resumo={{
            numero: v.numero,
            tipoEvento: v.tipoEvento,
            data: v.data,
            turno: v.turno?.nome ?? null,
            convidados: v.convidados,
            totalCentavos: v.totalCentavos,
          }}
          sinalCentavos={v.resultado.sinalCentavos}
          turno={v.turno}
        />
        <RodapeProposta modelo={m} />
      </main>
    </>
  );
}
