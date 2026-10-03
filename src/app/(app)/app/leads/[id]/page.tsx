import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReservaDoLead } from '@/components/app/leads/reserva-do-lead';
import { AcoesLead } from '@/components/app/leads/acoes-lead';
import {
  ItemTarefa,
  ItemVisita,
  LinhaDoTempo,
  Responsavel,
  type ItemTempo,
} from '@/components/app/leads/blocos-lead';
import { SeloStatus, Temperatura } from '@/components/app/leads/indicadores';
import { OrcamentosDoLead } from '@/components/app/orcamento/orcamentos-do-lead';
import { formatData, formatDataHora, hojeNoFuso } from '@/domain/dates';
import { descreverAtividade } from '@/domain/leads';
import { ROTULO_ORIGEM } from '@/domain/publico/origem';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarLead, prioridadeDoDetalhe } from '@/server/leads/carregar';

export const metadata: Metadata = { title: 'Lead' };

type Props = { params: Promise<{ id: string }> };

const PERIODO: Record<string, string> = { manha: 'manhã', tarde: 'tarde', noite: 'noite' };

/** Detalhe do lead com todas as ações do vendedor (URL própria para os avisos abrirem direto). */
export default async function LeadPage({ params }: Props) {
  const { id } = await params;
  const usuario = await exigirSessao();
  const lead = await carregarLead(usuario, id);
  if (!lead) notFound();
  const fuso = usuario.empresa.fuso;
  const { motivo } = prioridadeDoDetalhe(lead, usuario);
  const tarefasAbertas = lead.tarefas.filter((t) => !t.feitaEm);
  const visitasAtivas = lead.visitas.filter(
    (v) => v.status === 'solicitada' || v.status === 'confirmada',
  );
  const notasPorId = new Map(lead.notas.map((n) => [n.id, n]));

  const tempo: ItemTempo[] = lead.atividades.map((a) => {
    const nota = a.tipo === 'nota' ? notasPorId.get(String(a.dados.nota_id)) : undefined;
    return {
      id: a.id,
      texto: nota ? `${a.quem ?? 'A equipe'} anotou` : descreverAtividade(a.tipo, a.dados, a.quem),
      quando: formatDataHora(a.criadoEm, fuso),
      ...(nota
        ? {
            nota: {
              id: nota.id,
              texto: nota.texto,
              podeEditar: nota.podeEditar,
              podeApagar: nota.podeApagar,
              editada: !!nota.editadoEm,
            },
          }
        : {}),
    };
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-24 md:pb-6" data-testid="detalhe-lead">
      <Link
        href="/app/leads"
        className="text-muted-foreground inline-flex min-h-11 w-fit items-center gap-1 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Caixa de leads
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight break-words">{lead.nome}</h1>
          <SeloStatus status={lead.status} />
          <Temperatura temperatura={lead.temperatura} />
          {lead.ehTeste && (
            <span className="bg-alerta/15 text-alerta rounded-full px-2 py-0.5 text-xs font-semibold">
              Teste
            </span>
          )}
        </div>
        <p className="text-sm font-semibold" data-testid="motivo-detalhe">
          {motivo}
        </p>
        <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <a
            href={`https://wa.me/${lead.whatsappE164.replace('+', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-texto font-semibold underline-offset-2 hover:underline"
          >
            {lead.telefone}
          </a>
          {lead.email && <span>{lead.email}</span>}
          <span>Veio de {ROTULO_ORIGEM[lead.origem]}</span>
          {lead.proximoContatoEm && (
            <span data-testid="proximo-contato">
              Próximo contato: {formatDataHora(lead.proximoContatoEm, fuso)}
            </span>
          )}
        </p>
        <Responsavel
          leadId={lead.id}
          responsavel={lead.responsavel}
          usuarios={lead.usuarios}
          eu={usuario.id}
          ehDono={usuario.perfil === 'dono'}
        />
        {lead.perda && (
          <p
            className="rounded-control border-erro/30 bg-erro/10 text-erro border p-3 text-sm"
            data-testid="perda"
          >
            Perdido{lead.perda.em ? ` em ${formatData(lead.perda.em, fuso)}` : ''}:{' '}
            <strong>{lead.perda.rotulo}</strong>
            {lead.perda.detalhe ? ` (${lead.perda.detalhe})` : ''}. Use ⋯ → Reabrir se o cliente
            voltar.
          </p>
        )}
      </header>

      <AcoesLead
        lead={{
          id: lead.id,
          nome: lead.nome,
          email: lead.email,
          status: lead.status,
          temPreReserva: lead.reservas.some((r) => r.tipo === 'pre_reserva'),
        }}
      />

      {lead.reservas.length > 0 && (
        <section aria-labelledby="titulo-reserva">
          <h2 id="titulo-reserva" className="mb-2 font-bold">
            {lead.reservas.some((r) => r.tipo === 'confirmada') ? 'Reserva' : 'Pré-reserva'}
          </h2>
          <ReservaDoLead reservas={lead.reservas} hoje={hojeNoFuso(fuso)} />
        </section>
      )}

      <section aria-labelledby="titulo-tarefas">
        <h2 id="titulo-tarefas" className="font-bold">
          Tarefas
        </h2>
        {tarefasAbertas.length === 0 ? (
          <p className="text-muted-foreground mt-1 text-sm">
            Nenhuma tarefa aberta. Toque em <strong>+ Tarefa</strong> para lembrar do próximo passo.
          </p>
        ) : (
          <ul className="divide-y" data-testid="tarefas-lead">
            {tarefasAbertas.map((t) => (
              <ItemTarefa
                key={t.id}
                leadId={lead.id}
                tarefa={{
                  id: t.id,
                  titulo: t.titulo,
                  quando: formatDataHora(t.venceEm, fuso),
                  atrasada: t.atrasada,
                  feita: false,
                  mensagemSugerida: t.mensagemSugerida,
                  responsavelNome: t.responsavelNome,
                  automatica: t.automatica,
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {visitasAtivas.length > 0 && (
        <section aria-labelledby="titulo-visitas">
          <h2 id="titulo-visitas" className="font-bold">
            Visitas
          </h2>
          <ul className="divide-y" data-testid="visitas-lead">
            {visitasAtivas.map((v) => (
              <ItemVisita
                key={v.id}
                leadId={lead.id}
                visita={{
                  id: v.id,
                  status: v.status,
                  titulo:
                    v.status === 'confirmada' && v.dataHora
                      ? `Visita confirmada: ${formatDataHora(v.dataHora, fuso)}`
                      : `Pediu visita: ${formatData(v.dataPreferida)} (${PERIODO[v.periodo] ?? v.periodo})`,
                  observacoes: v.observacoes,
                }}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="titulo-orcamentos">
        <div className="flex items-center justify-between gap-2">
          <h2 id="titulo-orcamentos" className="font-bold">
            Orçamentos
          </h2>
          {!lead.ehTeste && (
            <Link
              href={`/app/orcamentos/novo?lead=${lead.id}`}
              className="text-primary-texto inline-flex min-h-11 items-center font-semibold underline-offset-2 hover:underline"
            >
              + Orçamento
            </Link>
          )}
        </div>
        {lead.orcamentos.length > 0 ? (
          <OrcamentosDoLead grupos={lead.orcamentos} />
        ) : (
          <p className="text-muted-foreground mt-1 text-sm">Nenhum orçamento concluído ainda.</p>
        )}
      </section>

      <LinhaDoTempo itens={tempo} leadId={lead.id} />
    </div>
  );
}
