import { CircleCheckBig } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/app/empty-state';
import { ItemTarefa } from '@/components/app/leads/blocos-lead';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { formatDataHora } from '@/domain/dates';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarTarefas, type TarefaDaTela } from '@/server/tarefas/carregar';

export const metadata: Metadata = { title: 'Tarefas' };

function Secao({
  titulo,
  tarefas,
  fuso,
  feitas = false,
  id,
}: {
  titulo: string;
  tarefas: TarefaDaTela[];
  fuso: string;
  feitas?: boolean;
  id: string;
}) {
  if (tarefas.length === 0) return null;
  return (
    <section aria-labelledby={id} className="bg-card rounded-card border p-3" data-testid={id}>
      <h2 id={id} className="font-bold">
        {titulo} <span className="text-muted-foreground font-normal">({tarefas.length})</span>
      </h2>
      <ul className="divide-y">
        {tarefas.map((t) => (
          <ItemTarefa
            key={t.id}
            leadId={t.lead.id}
            tarefa={{
              id: t.id,
              titulo: t.titulo,
              quando:
                feitas && t.feitaEm
                  ? `Feita em ${formatDataHora(t.feitaEm, fuso)}`
                  : formatDataHora(t.venceEm, fuso),
              atrasada: id === 'tarefas-atrasadas',
              feita: feitas,
              mensagemSugerida: t.mensagemSugerida,
              responsavelNome: null,
              automatica: t.automatica,
              lead: { id: t.lead.id, nome: t.lead.nome, telefone: t.lead.telefone },
            }}
          />
        ))}
      </ul>
    </section>
  );
}

/** Tarefas do usuário: atrasadas, hoje, próximos 7 dias e feitas recentemente. */
export default async function TarefasPage() {
  const usuario = await exigirSessao();
  const t = await carregarTarefas(usuario);
  const fuso = usuario.empresa.fuso;
  const nada = !t.atrasadas.length && !t.hoje.length && !t.proximas.length;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <TituloPagina>Tarefas</TituloPagina>
      {nada && (
        <EmptyState icone={CircleCheckBig} titulo="Tudo em dia">
          Nenhuma tarefa para os próximos dias. Crie tarefas no lead (<strong>+ Tarefa</strong>)
          para lembrar de ligar, mandar fotos ou cobrar o sinal.
        </EmptyState>
      )}
      <Secao id="tarefas-atrasadas" titulo="Atrasadas" tarefas={t.atrasadas} fuso={fuso} />
      <Secao id="tarefas-hoje" titulo="Hoje" tarefas={t.hoje} fuso={fuso} />
      <Secao id="tarefas-proximas" titulo="Próximos 7 dias" tarefas={t.proximas} fuso={fuso} />
      <Secao
        id="tarefas-feitas"
        titulo="Feitas recentemente"
        tarefas={t.feitas}
        fuso={fuso}
        feitas
      />
    </div>
  );
}
