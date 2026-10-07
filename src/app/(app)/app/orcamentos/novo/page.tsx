import { PackageOpen } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/app/empty-state';
import { FormOrcamento } from '@/components/app/orcamento/form-orcamento';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { montarVitrine } from '@/domain/publico';
import { estadoDaVersao, ORIGENS_INTERNAS } from '@/domain/validacao/orcamento-interno';
import { exigirSessao } from '@/server/auth/sessao';
import {
  carregarBaseInterna,
  carregarClienteDaReserva,
  carregarClienteDoLead,
} from '@/server/orcamentos/carregar';

export const metadata: Metadata = { title: 'Novo orçamento' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** "+ Orçamento": dono e vendedor montam a proposta de quem chamou no WhatsApp ou no telefone. */
export default async function NovoOrcamentoPage({ searchParams }: Props) {
  const busca = await searchParams;
  const usuario = await exigirSessao();
  const leadId = typeof busca.lead === 'string' ? busca.lead : null;
  // "Nova festa" na ficha do cliente sem lead (Etapa 12): nome e WhatsApp da festa anterior
  const reservaId = !leadId && typeof busca.reserva === 'string' ? busca.reserva : null;
  const [base, lead] = await Promise.all([
    carregarBaseInterna(usuario),
    leadId
      ? carregarClienteDoLead(usuario, leadId)
      : reservaId
        ? carregarClienteDaReserva(usuario, reservaId)
        : null,
  ]);
  const vitrine = base ? montarVitrine(base.ctx, {}, base.hoje) : null;

  if (!base || !vitrine || vitrine.tiposEvento.length === 0 || vitrine.pacotes.length === 0) {
    return (
      <>
        <TituloPagina>Novo orçamento</TituloPagina>
        <EmptyState icone={PackageOpen} titulo="Falta montar o catálogo">
          Para fazer orçamentos, cadastre tipos de festa, horários e pacotes em{' '}
          <Link
            href="/app/empresa/catalogo"
            className="text-primary-texto font-semibold underline-offset-2 hover:underline"
          >
            Minha empresa
          </Link>
          .
        </EmptyState>
      </>
    );
  }

  const origemValida = (o: string) => ORIGENS_INTERNAS.some((x) => x.valor === o);
  return (
    <>
      <TituloPagina>Novo orçamento</TituloPagina>
      <FormOrcamento
        vitrine={vitrine}
        fuso={usuario.empresa.fuso}
        limiteDescontoBp={base.limiteDescontoBp}
        ehDono={usuario.perfil === 'dono'}
        clienteInicial={
          lead
            ? {
                whatsapp: lead.whatsapp,
                nome: lead.nome,
                origem: origemValida(lead.origem) ? lead.origem : 'outro',
              }
            : null
        }
        estadoInicial={estadoDaVersao(null)}
        chaveRascunho={
          lead && leadId ? `lead:${leadId}` : lead && reservaId ? `reserva:${reservaId}` : 'novo'
        }
      />
    </>
  );
}
