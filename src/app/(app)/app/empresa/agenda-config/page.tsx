import { asc } from 'drizzle-orm';
import type { Metadata } from 'next';
import { normalizarHora } from '@/domain/conversao';
import { exigirSessao } from '@/server/auth/sessao';
import { espacos, turnos } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { ListaEspacos, ListaTurnos } from './listas';

export const metadata: Metadata = { title: 'Espaços e turnos' };

export default async function AgendaConfigPage() {
  const usuario = await exigirSessao();
  const somenteLeitura = usuario.perfil !== 'dono';
  const { listaEspacos, listaTurnos } = await comUsuario(usuario.id, async (tx) => ({
    listaEspacos: await tx
      .select({
        id: espacos.id,
        nome: espacos.nome,
        capacidadeMax: espacos.capacidadeMax,
        eventosSimultaneos: espacos.eventosSimultaneos,
        noLocalDoCliente: espacos.noLocalDoCliente,
        ativo: espacos.ativo,
      })
      .from(espacos)
      .orderBy(asc(espacos.ordem), asc(espacos.nome)),
    listaTurnos: await tx
      .select({
        id: turnos.id,
        nome: turnos.nome,
        horaInicio: turnos.horaInicio,
        duracaoMin: turnos.duracaoMin,
        diasSemana: turnos.diasSemana,
        ativo: turnos.ativo,
      })
      .from(turnos)
      .orderBy(asc(turnos.ordem), asc(turnos.horaInicio)),
  }));

  return (
    <div className="space-y-8">
      <section aria-labelledby="titulo-espacos" className="space-y-3">
        <div>
          <h2 id="titulo-espacos" className="text-lg font-bold">
            Espaços
          </h2>
          <p className="text-muted-foreground text-sm">
            Os salões ou áreas onde as festas acontecem, com a capacidade de cada um.
          </p>
        </div>
        <ListaEspacos espacos={listaEspacos} somenteLeitura={somenteLeitura} />
      </section>
      <section aria-labelledby="titulo-turnos" className="space-y-3">
        <div>
          <h2 id="titulo-turnos" className="text-lg font-bold">
            Turnos
          </h2>
          <p className="text-muted-foreground text-sm">
            Os horários de festa que o cliente pode escolher, e em quais dias da semana.
          </p>
        </div>
        <ListaTurnos
          turnos={listaTurnos.map((t) => ({
            ...t,
            horaInicio: normalizarHora(t.horaInicio) ?? t.horaInicio,
          }))}
          somenteLeitura={somenteLeitura}
        />
      </section>
    </div>
  );
}
