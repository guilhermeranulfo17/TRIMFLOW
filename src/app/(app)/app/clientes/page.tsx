import { Search, UsersRound } from 'lucide-react';
import type { Metadata } from 'next';
import Form from 'next/form';
import Link from 'next/link';
import { EmptyState } from '@/components/app/empty-state';
import { PendenteLink } from '@/components/app/pendente-link';
import { TituloPagina } from '@/components/app/titulo-pagina';
import {
  FILTROS_CLIENTES,
  LIMITE_CLIENTES,
  ROTULO_FILTRO_CLIENTES,
  buscaClientesDaUrl,
  filtroClientesDaUrl,
  limiteDaUrl,
  telaClientes,
  type Cliente,
  type FiltroClientes,
} from '@/domain/clientes';
import { diasEntre, formatData, type DataCivil } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { formatPhoneBR } from '@/domain/phone';
import { cn } from '@/lib/utils';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarClientes } from '@/server/clientes/carregar';

export const metadata: Metadata = { title: 'Clientes' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function url(filtro: FiltroClientes, busca: string, limite?: number): string {
  const p = new URLSearchParams();
  if (filtro !== 'todos') p.set('filtro', filtro);
  if (busca) p.set('busca', busca);
  if (limite) p.set('limite', String(limite));
  const s = p.toString();
  return s ? `/app/clientes?${s}` : '/app/clientes';
}

function quandoAniversario(aniversario: DataCivil, hoje: DataCivil): string {
  const d = diasEntre(hoje, aniversario);
  if (d === 0) return 'Faz 1 ano hoje';
  if (d > 0) return `Faz aniversário da festa em ${formatData(aniversario)}`;
  return `Fez aniversário da festa em ${formatData(aniversario)}`;
}

function Linha({ c, hoje, dono }: { c: Cliente; hoje: DataCivil; dono: boolean }) {
  const n = c.festas.length;
  return (
    <li>
      <Link
        href={`/app/clientes/${c.id}`}
        className="hover:bg-accent/50 flex flex-col gap-1 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        data-testid="item-cliente"
      >
        <span className="min-w-0">
          <span className="block font-semibold break-words">{c.nome}</span>
          <span className="text-muted-foreground block text-sm">
            {c.whatsapp ? formatPhoneBR(c.whatsapp) : 'Sem WhatsApp'}
            {` · ${n} ${n === 1 ? 'festa' : 'festas'}`}
          </span>
          <span
            className={cn(
              'block text-sm',
              c.horaDeChamar ? 'text-primary-texto font-medium' : 'text-muted-foreground',
            )}
          >
            {c.proximaFesta
              ? `Próxima festa: ${formatData(c.proximaFesta)}`
              : c.emNegociacao
                ? 'Pediu orçamento de novo'
                : c.horaDeChamar && c.aniversario
                  ? quandoAniversario(c.aniversario, hoje)
                  : c.ultimaFesta
                    ? `Última festa: ${formatData(c.ultimaFesta)}`
                    : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {dono && c.totalCentavos > 0 && (
            <span className="text-right text-sm tabular-nums">
              <span className="block font-semibold">{formatBRL(c.totalCentavos)}</span>
              <span className="text-muted-foreground block">em festas</span>
            </span>
          )}
          {c.horaDeChamar && (
            <span
              className="bg-destaque/15 text-primary-texto border-destaque/40 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
              data-testid="selo-chamar"
            >
              Chamar de novo
            </span>
          )}
          <PendenteLink />
        </span>
      </Link>
    </li>
  );
}

/**
 * Clientes (Etapa 12): quem já fechou festa. Busca por nome ou telefone, filtros e o "hora de
 * chamar de novo" (a festa faz um ano e não há outra marcada).
 */
export default async function ClientesPage({ searchParams }: Props) {
  const usuario = await exigirSessao();
  const busca = await searchParams;
  const filtro = filtroClientesDaUrl(busca.filtro);
  const termo = buscaClientesDaUrl(busca.busca);
  const limite = limiteDaUrl(busca.limite);
  const { hoje, clientes } = await carregarClientes(usuario);
  const t = telaClientes(clientes, filtro, termo, limite);
  const dono = usuario.perfil === 'dono';

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <TituloPagina>Clientes</TituloPagina>

      {t.total === 0 ? (
        <EmptyState icone={UsersRound} titulo="Ainda não há clientes">
          Quem fecha festa aparece aqui quando a reserva é confirmada na Agenda. Daqui você vê todas
          as festas de cada cliente e chama de novo quando a festa fizer um ano.
        </EmptyState>
      ) : (
        <>
          <Form action="/app/clientes" className="flex gap-2" role="search">
            {filtro !== 'todos' && <input type="hidden" name="filtro" value={filtro} />}
            <label className="relative flex-1">
              <span className="sr-only">Buscar cliente</span>
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <input
                type="search"
                name="busca"
                defaultValue={termo}
                maxLength={80}
                placeholder="Nome ou telefone"
                className="rounded-control border-input bg-background focus-visible:ring-ring/50 h-11 w-full border pr-3 pl-9 text-base focus-visible:ring-[3px] focus-visible:outline-none"
                data-testid="busca-clientes"
              />
            </label>
            <button
              type="submit"
              className="rounded-control hover:bg-accent min-h-11 border px-4 text-sm font-semibold"
            >
              Buscar
            </button>
          </Form>

          <nav aria-label="Filtrar clientes" data-testid="filtros-clientes">
            <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
              {FILTROS_CLIENTES.map((f) => {
                const ativo = f === filtro;
                return (
                  <li key={f} className="shrink-0">
                    <Link
                      href={url(f, termo)}
                      aria-current={ativo ? 'page' : undefined}
                      className={cn(
                        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors',
                        ativo
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'hover:bg-accent',
                      )}
                      data-testid={`filtro-clientes-${f}`}
                    >
                      {ROTULO_FILTRO_CLIENTES[f]}
                      <span className={cn('text-xs', !ativo && 'text-muted-foreground')}>
                        {t.contagem[f]}
                      </span>
                      <PendenteLink />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {t.clientes.length === 0 ? (
            <EmptyState icone={UsersRound} titulo="Ninguém por aqui">
              {termo
                ? 'Nenhum cliente com esse nome ou telefone neste filtro.'
                : filtro === 'chamar'
                  ? 'Nenhuma festa fazendo um ano nos próximos 60 dias. Volte depois.'
                  : 'Nenhum cliente com festa marcada.'}
            </EmptyState>
          ) : (
            <ul className="bg-card rounded-card divide-y border" data-testid="lista-clientes">
              {t.clientes.map((c) => (
                <Linha key={c.id} c={c} hoje={hoje} dono={dono} />
              ))}
            </ul>
          )}
          {t.temMais && (
            <Link
              href={url(filtro, termo, limite + LIMITE_CLIENTES)}
              scroll={false}
              className="rounded-control hover:bg-accent mx-auto inline-flex min-h-11 items-center gap-2 border px-5 text-sm font-semibold"
              data-testid="mais-clientes"
            >
              Mostrar mais
              <PendenteLink />
            </Link>
          )}
        </>
      )}
    </div>
  );
}
