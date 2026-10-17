import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormLeadVendas } from '@/components/interno/vendas/form-lead';
import { formatData, formatDataHora } from '@/domain/dates';
import { ROTULO_ETAPA_VENDAS } from '@/domain/vendas/etapas';
import { exigirAdmin } from '@/server/interno/guard';
import { carregarLeadVendas } from '@/server/vendas/leads';

export const metadata: Metadata = { title: 'Lead' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/;

export default async function LeadVendas({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const l = await carregarLeadVendas(id);
  if (!l) notFound();
  return (
    <div className="flex flex-col gap-4" data-testid="lead-vendas">
      <Link href="/interno/vendas/leads" className="text-primary-texto text-sm font-semibold">
        ← Leads
      </Link>
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">{l.nome}</h2>
        <p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span data-testid="etapa-lead">Etapa: {ROTULO_ETAPA_VENDAS[l.etapa]}</span>
          <span>Tentativas sem resposta: {l.tentativas}</span>
          <span>Cadastrado em {formatData(l.criadoEm)}</span>
          <span>Atualizado em {formatDataHora(l.atualizadoEm)}</span>
        </p>
      </header>
      <FormLeadVendas
        id={l.id}
        inicial={{
          nome: l.nome,
          buffet: l.buffet ?? '',
          telefone: l.telefoneE164 ?? '',
          cidade: l.cidade ?? '',
          origem: l.origem ?? '',
          resumo: l.resumo ?? '',
          proximoFollowup: l.proximoFollowup ?? '',
          naoContatar: l.naoContatar,
        }}
      />
    </div>
  );
}
