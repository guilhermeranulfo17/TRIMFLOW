'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Folha } from '@/components/app/agenda/folha';
import { classeCampo } from '@/components/app/form/estilos';
import { Button } from '@/components/ui/button';
import {
  contarFiltros,
  filtrosParaUrl,
  ORIGENS_LEAD,
  ROTULO_ATALHO,
  type FiltrosCaixa,
} from '@/domain/leads/filtros';
import { ROTULO_TEMPERATURA } from '@/domain/leads/temperatura';
import { ROTULO_ORIGEM } from '@/domain/publico/origem';
import {
  ROTULO_STATUS_LEAD,
  STATUS_LEAD,
  TEMPERATURAS,
  type StatusLead,
} from '@/domain/publico/status-lead';
import { cn } from '@/lib/utils';

type Usuario = { id: string; nome: string };

function alternar<T>(lista: T[] | undefined, valor: T): T[] | undefined {
  const atual = lista ?? [];
  const nova = atual.includes(valor) ? atual.filter((x) => x !== valor) : [...atual, valor];
  return nova.length ? nova : undefined;
}

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'min-h-10 rounded-full border px-3 text-sm font-semibold',
        ativo ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

function Controles({
  f,
  mudar,
  usuarios,
}: {
  f: FiltrosCaixa;
  mudar: (p: Partial<FiltrosCaixa>) => void;
  usuarios: Usuario[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Responsável</legend>
        <div className="flex flex-wrap gap-2">
          <Chip
            ativo={f.responsavel === 'meus'}
            onClick={() => mudar({ responsavel: f.responsavel === 'meus' ? undefined : 'meus' })}
          >
            Meus
          </Chip>
          <Chip
            ativo={f.responsavel === 'sem'}
            onClick={() => mudar({ responsavel: f.responsavel === 'sem' ? undefined : 'sem' })}
          >
            Sem responsável
          </Chip>
          {usuarios.length > 1 && (
            <select
              aria-label="Responsável específico"
              className={cn(classeCampo, 'h-10 w-auto')}
              value={
                f.responsavel && f.responsavel !== 'meus' && f.responsavel !== 'sem'
                  ? f.responsavel
                  : ''
              }
              onChange={(e) => mudar({ responsavel: e.target.value || undefined })}
            >
              <option value="">Qualquer pessoa</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          )}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Status</legend>
        <div className="flex flex-wrap gap-2">
          {STATUS_LEAD.map((s: StatusLead) => (
            <Chip
              key={s}
              ativo={!!f.status?.includes(s)}
              onClick={() => mudar({ status: alternar(f.status, s) })}
            >
              {ROTULO_STATUS_LEAD[s]}
            </Chip>
          ))}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Sem status marcado, a caixa mostra só os leads em negociação.
        </p>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Temperatura</legend>
        <div className="flex flex-wrap gap-2">
          {TEMPERATURAS.map((t) => (
            <Chip
              key={t}
              ativo={!!f.temperatura?.includes(t)}
              onClick={() => mudar({ temperatura: alternar(f.temperatura, t) })}
            >
              {ROTULO_TEMPERATURA[t]}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Origem</legend>
        <div className="flex flex-wrap gap-2">
          {ORIGENS_LEAD.map((o) => (
            <Chip
              key={o}
              ativo={!!f.origem?.includes(o)}
              onClick={() => mudar({ origem: alternar(f.origem, o) })}
            >
              {ROTULO_ORIGEM[o]}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Data da festa</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-muted-foreground text-xs">
            De
            <input
              type="date"
              className={classeCampo}
              value={f.eventoDe ?? ''}
              onChange={(e) => mudar({ eventoDe: e.target.value || undefined })}
            />
          </label>
          <label className="text-muted-foreground text-xs">
            Até
            <input
              type="date"
              className={classeCampo}
              value={f.eventoAte ?? ''}
              onChange={(e) => mudar({ eventoAte: e.target.value || undefined })}
            />
          </label>
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Chip
          ativo={!!f.atrasadas}
          onClick={() => mudar({ atrasadas: f.atrasadas ? undefined : true })}
        >
          Com tarefa atrasada
        </Chip>
        <Chip ativo={!!f.teste} onClick={() => mudar({ teste: f.teste ? undefined : true })}>
          Incluir leads de teste
        </Chip>
      </div>
    </div>
  );
}

/**
 * Busca e filtros da caixa. Tudo vai para a URL (compartilhável; voltar do navegador mantém).
 * Celular: sheet com "Aplicar". Desktop: painel aberto que aplica na hora.
 */
export function FiltrosCaixa({
  filtros,
  usuarios,
}: {
  filtros: FiltrosCaixa;
  usuarios: Usuario[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<FiltrosCaixa>(filtros);
  const [busca, setBusca] = useState(filtros.busca ?? '');
  const [desktopAberto, setDesktopAberto] = useState(contarFiltros(filtros) > 0);

  useEffect(() => {
    setRascunho(filtros);
    setBusca(filtros.busca ?? '');
  }, [filtros]);

  const ir = (f: FiltrosCaixa) => {
    const qs = filtrosParaUrl(f);
    router.push(`/app/leads${qs ? `?${qs}` : ''}`, { scroll: false });
  };
  const total = contarFiltros(filtros);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <form
          role="search"
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            ir({ ...filtros, busca: busca.trim() || undefined });
          }}
        >
          <Search
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            aria-label="Buscar lead"
            className="bg-card focus-visible:ring-ring/50 rounded-control h-11 w-full border pr-3 pl-9 text-base focus-visible:ring-[3px] focus-visible:outline-none"
          />
        </form>
        <Button
          type="button"
          variant="outline"
          className="h-11 md:hidden"
          onClick={() => setAberto(true)}
          aria-label={`Filtros${total ? ` (${total} ligados)` : ''}`}
        >
          <SlidersHorizontal aria-hidden />
          {total > 0 && <span className="tabular-nums">{total}</span>}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="hidden h-11 md:inline-flex"
          aria-expanded={desktopAberto}
          onClick={() => setDesktopAberto((v) => !v)}
        >
          <SlidersHorizontal aria-hidden />
          Filtros{total > 0 ? ` (${total})` : ''}
        </Button>
      </div>

      {(filtros.atalho || total > 0 || filtros.busca) && (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="filtros-ativos">
          {filtros.atalho && (
            <span className="bg-accent rounded-full px-3 py-1 font-semibold">
              {ROTULO_ATALHO[filtros.atalho]}
            </span>
          )}
          {filtros.busca && (
            <span className="bg-accent rounded-full px-3 py-1 font-semibold">
              “{filtros.busca}”
            </span>
          )}
          <button
            type="button"
            className="text-primary-texto inline-flex min-h-9 items-center gap-1 font-semibold"
            onClick={() => ir({})}
          >
            <X className="size-4" aria-hidden />
            Limpar
          </button>
        </div>
      )}

      {desktopAberto && (
        <div
          className="bg-card rounded-card hidden border p-4 md:block"
          data-testid="barra-filtros"
        >
          <Controles f={filtros} mudar={(p) => ir({ ...filtros, ...p })} usuarios={usuarios} />
        </div>
      )}

      <Folha aberto={aberto} onAbertoChange={setAberto} titulo="Filtros">
        <Controles
          f={rascunho}
          mudar={(p) => setRascunho((r) => ({ ...r, ...p }))}
          usuarios={usuarios}
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setRascunho({ busca: filtros.busca, atalho: filtros.atalho })}
          >
            Limpar
          </Button>
          <Button
            type="button"
            onClick={() => {
              setAberto(false);
              ir(rascunho);
            }}
          >
            Aplicar
          </Button>
        </div>
      </Folha>
    </div>
  );
}
