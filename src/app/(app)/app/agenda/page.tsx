import { CalendarDays } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/app/empty-state';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { Button } from '@/components/ui/button';
import { limitesDoMes, montarCalendario } from '@/domain/agenda';
import { hojeNoFuso, somarDias } from '@/domain/dates';
import {
  carregarBase,
  carregarDisponibilidade,
  carregarPeriodo,
  preReservasVencendo,
} from '@/server/agenda/carregar';
import { exigirSessao } from '@/server/auth/sessao';
import { AgendaCliente } from './agenda-cliente';

export const metadata: Metadata = { title: 'Agenda' };

type Props = { searchParams: Promise<{ mes?: string; espaco?: string }> };

export default async function AgendaPage({ searchParams }: Props) {
  const usuario = await exigirSessao();
  const params = await searchParams;
  const hoje = hojeNoFuso(usuario.empresa.fuso);
  const mesEscolhido = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes ?? '');
  const mes = mesEscolhido ? params.mes! : hoje.slice(0, 7);
  const base = await carregarBase(usuario);
  const espacoId = base.espacos.some((e) => e.id === params.espaco) ? params.espaco! : '';

  if (base.espacos.length === 0 || base.turnos.length === 0) {
    return (
      <>
        <TituloPagina>Agenda</TituloPagina>
        <EmptyState icone={CalendarDays} titulo="Falta configurar espaços e turnos">
          <p>
            A agenda mostra cada espaço e turno como livre, pré-reservado, reservado ou bloqueado.
            Cadastre pelo menos um espaço e um turno para começar.
          </p>
          <Button asChild className="mt-5">
            <Link href="/app/empresa/agenda-config">Configurar espaços e turnos</Link>
          </Button>
        </EmptyState>
      </>
    );
  }

  const { de, ate } = limitesDoMes(mes);
  const periodoLista = mesEscolhido ? { de, ate } : { de: hoje, ate: somarDias(hoje, 59) };
  const [disponibilidade, lista, vencendo] = await Promise.all([
    carregarDisponibilidade(usuario, de, ate, espacoId || null),
    carregarPeriodo(usuario, periodoLista.de, periodoLista.ate),
    preReservasVencendo(usuario, 12),
  ]);

  return (
    <>
      <TituloPagina>Agenda</TituloPagina>
      <AgendaCliente
        base={base}
        hoje={hoje}
        mes={mes}
        mesEscolhido={mesEscolhido}
        espacoId={espacoId}
        calendario={montarCalendario(mes, disponibilidade)}
        lista={lista}
        vencendo={vencendo}
        podeBloquear={usuario.perfil === 'dono'}
      />
    </>
  );
}
