import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { origemDoParametro, passoValido, pendenciasDoContexto } from '@/domain/publico';
import { escolhasSchema } from '@/domain/validacao/publico';
import { carregarVitrine, lerEstadoOrcamento } from '@/server/publico/carregar';
import { ehModoTeste, lerTokenDoCookie } from '@/server/publico/sessao';
import { assinarInstante } from '@/server/publico/seguranca';
import { BannerTeste } from '@/components/publico/banner-teste';
import { exigirBuffet } from '../buscar';
import { Wizard } from './wizard';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: 'Monte seu orçamento',
  robots: { index: false, follow: false },
};

/** Wizard de orçamento (até 6 passos). Preço sempre calculado no servidor. */
export default async function PaginaOrcamento({ params, searchParams }: Props) {
  const { slug } = await params;
  const busca = await searchParams;
  const buffet = await exigirBuffet(slug, '/orcamento');
  if (buffet.suspenso) redirect(`/b/${slug}`);
  const dados = await carregarVitrine(slug);
  if (!dados || pendenciasDoContexto(dados.contexto.ctx).length > 0) redirect(`/b/${slug}`);

  const [modoTeste, token] = await Promise.all([ehModoTeste(slug), lerTokenDoCookie(slug)]);
  const estado = token ? await lerEstadoOrcamento(slug, token) : null;
  const emAndamento =
    estado && ['em_montagem', 'enviado', 'visualizado'].includes(estado.status) ? estado : null;
  const rascunho = emAndamento ? escolhasSchema.safeParse(emAndamento.rascunho) : null;

  const tipo = typeof busca.tipo === 'string' ? busca.tipo : undefined;
  const tipoNaUrl = !!tipo && dados.vitrine.tiposEvento.some((t) => t.id === tipo);

  return (
    <>
      {modoTeste && <BannerTeste />}
      <Wizard
        slug={slug}
        buffet={{ nome: buffet.nome, whatsappE164: buffet.whatsappE164, logoUrl: buffet.logoUrl }}
        vitrine={dados.vitrine}
        origem={origemDoParametro(busca.origem)}
        tipoNaUrl={tipoNaUrl ? tipo : undefined}
        inicio={assinarInstante()}
        retomada={
          rascunho?.success
            ? { escolhas: rascunho.data, passo: passoValido(emAndamento!.passoAtual) ?? 4 }
            : null
        }
      />
    </>
  );
}
