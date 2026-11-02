import { and, asc, eq, gte } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FormContratar, type FestaOpcao } from '@/components/app/solucoes/form-contratar';
import { formatData, hojeNoFuso } from '@/domain/dates';
import { resumoCompra } from '@/domain/modulos';
import { formatBRL } from '@/domain/money';
import { exigirPerfil } from '@/server/auth/guards';
import { reservas } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { carregarSolucao } from '@/server/modulos/carregar';

export const metadata: Metadata = { title: 'Contratar solução' };

type Props = { params: Promise<{ codigo: string }> };

/** Resumo da compra e confirmação (só o dono; o servidor confere tudo de novo ao contratar). */
export default async function ContratarPage({ params }: Props) {
  const { codigo } = await params;
  const dono = await exigirPerfil('dono');
  const t = await carregarSolucao(dono, codigo);
  if (!t) notFound();
  const s = t.solucao;
  if (!s.contratavel || !t.podeContratar || (s.acesso && s.cobranca === 'mensal')) {
    redirect(`/app/solucoes/${s.codigo}`);
  }
  const hoje = hojeNoFuso(dono.empresa.fuso);
  let festas: FestaOpcao[] | null = null;
  if (s.cobranca === 'por_evento') {
    const lista = await comUsuario(dono.id, (tx) =>
      tx
        .select({ id: reservas.id, data: reservas.data, cliente: reservas.clienteNome })
        .from(reservas)
        .where(
          and(
            eq(reservas.tipo, 'confirmada'),
            eq(reservas.status, 'ativa'),
            gte(reservas.data, hoje),
          ),
        )
        .orderBy(asc(reservas.data))
        .limit(100),
    );
    festas = lista.map((r) => ({ id: r.id, rotulo: `${formatData(r.data)} · ${r.cliente}` }));
  }
  const resumo = resumoCompra(
    {
      nome: s.nome,
      cobranca: s.cobranca,
      precoCentavos: s.precoCentavos,
      carenciaDias: s.carenciaDias,
      acessoEventoDias: s.acessoEventoDias,
    },
    { hoje },
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href={`/app/solucoes/${s.codigo}`}
        className="text-muted-foreground hover:text-foreground inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {s.nome}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Contratar o {s.nome}</h1>

      <section
        className="bg-card rounded-card border p-5"
        aria-labelledby="titulo-resumo"
        data-testid="resumo-compra"
      >
        <h2 id="titulo-resumo" className="font-bold">
          Resumo da compra
        </h2>
        <p className="mt-2 text-2xl font-bold tabular-nums">{formatBRL(resumo.agoraCentavos)}</p>
        <dl className="mt-4 grid gap-3 text-sm">
          {resumo.linhas.map((l) => (
            <div key={l.rotulo} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
              <dt className="font-semibold">{l.rotulo}</dt>
              <dd className="text-muted-foreground">{l.texto}</dd>
            </div>
          ))}
          {s.custosExternos.length > 0 && (
            <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
              <dt className="font-semibold">Custos externos</dt>
              <dd className="text-muted-foreground">{s.custosExternos.join(' ')}</dd>
            </div>
          )}
          <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold">Não está incluído</dt>
            <dd className="text-muted-foreground">{s.foraDoEscopo.join(', ')}.</dd>
          </div>
        </dl>
      </section>

      {festas && festas.length === 0 ? (
        <p className="bg-card rounded-card border p-5 text-sm">
          Nenhuma festa confirmada pela frente. Confirme a reserva na Agenda e volte aqui.
        </p>
      ) : (
        <FormContratar
          codigo={s.codigo}
          nome={s.nome}
          pedirDados={!t.temDadosCobranca}
          festas={festas}
        />
      )}
    </div>
  );
}
