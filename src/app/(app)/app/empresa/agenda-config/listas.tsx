'use client';

import { ListaConfig } from '@/components/app/empresa/lista-config';
import { formatarDuracao, resumirDias } from '@/domain/conversao';
import {
  excluirEspaco,
  excluirTurno,
  reordenarEspacos,
  reordenarTurnos,
  salvarEspaco,
  salvarTurno,
} from '@/server/actions/empresa/agenda-config';
import { FormEspaco, type EspacoItem } from './form-espaco';
import { FormTurno, type TurnoItem } from './form-turno';

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-card text-muted-foreground border border-dashed px-4 py-6 text-center text-sm">
      {children}
    </p>
  );
}

export function ListaEspacos({
  espacos,
  somenteLeitura,
}: {
  espacos: EspacoItem[];
  somenteLeitura: boolean;
}) {
  return (
    <ListaConfig
      itens={espacos}
      nomeItem="espaço"
      rotulo={(e) => e.nome}
      resumo={(e) =>
        `Até ${e.capacidadeMax} convidados${e.noLocalDoCliente ? ' · no local do cliente' : ''}`
      }
      somenteLeitura={somenteLeitura}
      textoAdicionar="Adicionar espaço"
      vazio={
        <Vazio>Nenhum espaço cadastrado. Sem espaço, o cliente não consegue pedir orçamento.</Vazio>
      }
      renderForm={(item, fechar) => (
        <FormEspaco espaco={item} somenteLeitura={somenteLeitura} onFechar={fechar} />
      )}
      onExcluir={excluirEspaco}
      onReordenar={reordenarEspacos}
      onAlternarAtivo={({ id, ativo, ...resto }) => salvarEspaco(id, { ...resto, ativo: !ativo })}
    />
  );
}

export function ListaTurnos({
  turnos,
  somenteLeitura,
}: {
  turnos: TurnoItem[];
  somenteLeitura: boolean;
}) {
  return (
    <ListaConfig
      itens={turnos}
      nomeItem="turno"
      rotulo={(t) => t.nome}
      resumo={(t) =>
        `${t.horaInicio} · ${formatarDuracao(t.duracaoMin)} · ${resumirDias(t.diasSemana)}`
      }
      somenteLeitura={somenteLeitura}
      textoAdicionar="Adicionar turno"
      vazio={
        <Vazio>Nenhum turno cadastrado. Sem turno, o cliente não consegue escolher horário.</Vazio>
      }
      renderForm={(item, fechar) => (
        <FormTurno turno={item} somenteLeitura={somenteLeitura} onFechar={fechar} />
      )}
      onExcluir={excluirTurno}
      onReordenar={reordenarTurnos}
      onAlternarAtivo={({ id, ativo, ...resto }) => salvarTurno(id, { ...resto, ativo: !ativo })}
    />
  );
}
