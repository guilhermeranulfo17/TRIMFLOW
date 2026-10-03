import { BarChart3, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { LinhaDoLink } from '@/components/app/divulgacao/linha-do-link';
import { EmptyState } from '@/components/app/empty-state';
import { Atendimento } from '@/components/app/numeros/atendimento';
import { CartoesDono, CartoesVendedor } from '@/components/app/numeros/cartoes';
import { Funil } from '@/components/app/numeros/funil';
import { DatasLivres, Ocupacao } from '@/components/app/numeros/ocupacao';
import { MotivosDePerda, PorOrigem } from '@/components/app/numeros/origem-motivos';
import { SeletorPeriodo } from '@/components/app/numeros/periodo';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { hojeNoFuso } from '@/domain/dates';
import { resolverPeriodo } from '@/domain/numeros';
import { exigirSessao } from '@/server/auth/sessao';
import { recursosDaEmpresa } from '@/server/cobranca/carregar';
import { urlDoSite } from '@/server/env';
import { usuariosDaEmpresa } from '@/server/leads/carregar';
import { carregarNumeros, carregarOcupacao } from '@/server/numeros/carregar';

export const metadata: Metadata = { title: 'Números' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * Números: o link traz gente? Essa gente reserva? De onde vem quem fecha? O dono vê tudo; o
 * vendedor, só os próprios leads, reservas e tempo de atendimento.
 */
export default async function NumerosPage({ searchParams }: Props) {
  const usuario = await exigirSessao();
  const busca = await searchParams;
  const periodo = resolverPeriodo(
    { periodo: um(busca.periodo), de: um(busca.de), ate: um(busca.ate) },
    hojeNoFuso(usuario.empresa.fuso),
  );
  const dono = usuario.perfil === 'dono';
  const link = `${urlDoSite() ?? ''}/b/${usuario.empresa.slug}`;
  // Essencial: cartões e funil; o resto é do Profissional (teste = Profissional)
  const completo = (await recursosDaEmpresa(usuario.empresa.id)).numerosCompleto;
  const [n, ocupacao, usuarios] = await Promise.all([
    carregarNumeros(usuario, periodo.de, periodo.ate),
    dono && completo ? carregarOcupacao(usuario) : null,
    usuariosDaEmpresa(usuario),
  ]);
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  const vazio = n.resumo.visitas === 0 && n.resumo.leads === 0 && n.resumo.reservas === 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4" data-testid="pagina-numeros">
      <TituloPagina>Números</TituloPagina>
      <SeletorPeriodo periodo={periodo} />

      {vazio && (
        <EmptyState icone={BarChart3} titulo="Ainda sem números neste período">
          {dono ? (
            <>
              Divulgue seu link para começar a ver números: cada visita, orçamento e reserva aparece
              aqui.
              <span className="mt-3 block text-left">
                <LinhaDoLink link={link} />
              </span>
            </>
          ) : (
            'Quando você atender leads, seus números aparecem aqui.'
          )}
        </EmptyState>
      )}

      {dono ? (
        <CartoesDono atual={n.resumo} anterior={n.anterior} />
      ) : (
        <CartoesVendedor
          atual={n.resumo}
          anterior={n.anterior}
          medianaMin={n.atendimento.total.medianaMin}
        />
      )}

      {dono && !completo && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Funil resumo={n.resumo} />
          <section
            className="bg-card rounded-card flex flex-col items-start gap-3 border p-4 sm:p-5"
            data-testid="numeros-profissional"
          >
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Sparkles className="text-primary size-5" aria-hidden />
              Disponível no Profissional
            </h2>
            <p className="text-muted-foreground text-sm">
              De onde vêm os leads que fecham, por que você perde, a ocupação dos próximos meses, as
              datas livres para promoção e o tempo de resposta de cada vendedor.
            </p>
            <Link
              href="/app/empresa/plano"
              className="bg-primary text-primary-foreground rounded-control inline-flex min-h-11 items-center px-4 font-semibold"
            >
              Mudar de plano
            </Link>
          </section>
        </div>
      )}

      {dono && completo && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Funil resumo={n.resumo} />
          <PorOrigem linhas={n.porOrigem} />
          <MotivosDePerda linhas={n.motivos} />
          <Atendimento
            total={n.atendimento.total}
            porVendedor={n.atendimento.porVendedor}
            nomes={nomes}
          />
          {ocupacao && <Ocupacao o={ocupacao} />}
          {ocupacao && <DatasLivres o={ocupacao} buffet={usuario.empresa.nome} link={link} />}
        </div>
      )}
      {!dono && <Atendimento total={n.atendimento.total} porVendedor={[]} nomes={nomes} />}
    </div>
  );
}
