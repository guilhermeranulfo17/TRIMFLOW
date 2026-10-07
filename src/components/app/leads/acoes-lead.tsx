'use client';

import {
  CalendarPlus,
  FilePlus2,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
  ThumbsDown,
  Timer,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Folha } from '@/components/app/agenda/folha';
import { Campo } from '@/components/app/form/campo';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MOTIVOS_PERDA, type MotivoPerda } from '@/domain/leads/motivos-perda';
import { cn } from '@/lib/utils';
import type { ResultadoAcao } from '@/server/actions/empresa/comum';
import {
  adicionarNota,
  agendarVisita,
  atualizarDadosLead,
  criarTarefa,
  definirProximoContato,
  marcarPerdido,
  reabrirLead,
} from '@/server/actions/leads';
import { CampoQuando } from './campo-quando';
import { BotaoWhatsApp } from './mensagem-pronta';
import { BotaoRegistrarContato } from './registrar-contato';

/** Roda uma action: toast, campos com erro e atualização da tela. */
export function useAcao() {
  const toast = useToast();
  const router = useRouter();
  const [executando, iniciar] = useTransition();
  const [campos, setCampos] = useState<Record<string, string>>({});
  function executar(acao: () => Promise<ResultadoAcao<unknown>>, depois?: () => void) {
    iniciar(async () => {
      const r = await acao();
      if (r.ok) {
        setCampos({});
        if (r.mensagem) toast.sucesso(r.mensagem);
        depois?.();
        router.refresh();
      } else {
        setCampos(r.campos ?? {});
        toast.erro(r.erro);
      }
    });
  }
  return { executar, executando, campos };
}

type Formulario = 'tarefa' | 'nota' | 'visita' | 'perdido' | 'dados' | 'proximo' | null;

export type LeadParaAcoes = {
  id: string;
  nome: string;
  email: string | null;
  status: string;
  temPreReserva: boolean;
};

function FormTarefa({ leadId, fechar }: { leadId: string; fechar: () => void }) {
  const { executar, executando, campos } = useAcao();
  const [titulo, setTitulo] = useState('');
  const [quando, setQuando] = useState('amanhã 9h');
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        executar(() => criarTarefa(leadId, { titulo, quando }), fechar);
      }}
    >
      <Campo id="tarefa-titulo" rotulo="O que fazer" erro={campos.titulo}>
        <Input
          id="tarefa-titulo"
          value={titulo}
          maxLength={160}
          placeholder="Ex.: Mandar fotos do salão"
          onChange={(e) => setTitulo(e.target.value)}
          autoFocus
        />
      </Campo>
      <Campo id="tarefa-quando" rotulo="Quando" erro={undefined}>
        <CampoQuando id="tarefa-quando" valor={quando} onChange={setQuando} erro={campos.quando} />
      </Campo>
      <Button type="submit" size="lg" disabled={executando || !titulo.trim()}>
        Criar tarefa
      </Button>
    </form>
  );
}

function FormNota({ leadId, fechar }: { leadId: string; fechar: () => void }) {
  const { executar, executando, campos } = useAcao();
  const [texto, setTexto] = useState('');
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        executar(() => adicionarNota(leadId, { texto }), fechar);
      }}
    >
      <Campo id="nota-texto" rotulo="Nota" erro={campos.texto} dica="Só a equipe vê.">
        <Textarea
          id="nota-texto"
          rows={5}
          maxLength={2000}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          autoFocus
        />
      </Campo>
      <Button type="submit" size="lg" disabled={executando || !texto.trim()}>
        Salvar nota
      </Button>
    </form>
  );
}

function FormVisita({ leadId, fechar }: { leadId: string; fechar: () => void }) {
  const { executar, executando, campos } = useAcao();
  const [quando, setQuando] = useState('');
  const [obs, setObs] = useState('');
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        executar(() => agendarVisita(leadId, { quando, observacoes: obs }), fechar);
      }}
    >
      <Campo id="visita-quando" rotulo="Dia e hora combinados">
        <CampoQuando
          id="visita-quando"
          valor={quando}
          onChange={setQuando}
          erro={campos.quando}
          atalhos={['amanhã 10h', 'amanhã 15h', 'em 2 dias 10h', 'em 2 dias 15h']}
        />
      </Campo>
      <Campo id="visita-obs" rotulo="Observações (opcional)">
        <Input
          id="visita-obs"
          value={obs}
          maxLength={500}
          onChange={(e) => setObs(e.target.value)}
        />
      </Campo>
      <Button type="submit" size="lg" disabled={executando || !quando}>
        Agendar visita
      </Button>
    </form>
  );
}

export function FormPerdido({
  leadId,
  temPreReserva,
  fechar,
}: {
  leadId: string;
  temPreReserva: boolean;
  fechar: () => void;
}) {
  const { executar, executando, campos } = useAcao();
  const [motivo, setMotivo] = useState<MotivoPerda | null>(null);
  const [detalhe, setDetalhe] = useState('');
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (motivo) executar(() => marcarPerdido(leadId, { motivo, detalhe }), fechar);
      }}
    >
      {temPreReserva && (
        <p
          className="rounded-control border-alerta/30 bg-alerta/10 text-alerta border p-3 text-sm font-semibold"
          role="alert"
        >
          A pré-reserva deste lead será cancelada e a data ficará livre na Agenda.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Motivo da perda">
        {MOTIVOS_PERDA.map((m) => (
          <button
            key={m.codigo}
            type="button"
            role="radio"
            aria-checked={motivo === m.codigo}
            onClick={() => setMotivo(m.codigo)}
            className={cn(
              'rounded-card min-h-14 border p-2 text-sm font-semibold',
              motivo === m.codigo ? 'border-primary bg-accent' : 'hover:bg-accent',
            )}
          >
            {m.rotulo}
          </button>
        ))}
      </div>
      <Campo
        id="perdido-detalhe"
        rotulo={motivo === 'outro' ? 'Qual o motivo?' : 'Detalhe (opcional)'}
        erro={campos.detalhe}
      >
        <Input
          id="perdido-detalhe"
          value={detalhe}
          maxLength={300}
          onChange={(e) => setDetalhe(e.target.value)}
        />
      </Campo>
      <Button
        type="submit"
        size="lg"
        variant="destructive"
        disabled={executando || !motivo || (motivo === 'outro' && !detalhe.trim())}
      >
        Marcar como perdido
      </Button>
    </form>
  );
}

function FormDados({ lead, fechar }: { lead: LeadParaAcoes; fechar: () => void }) {
  const { executar, executando, campos } = useAcao();
  const [nome, setNome] = useState(lead.nome);
  const [email, setEmail] = useState(lead.email ?? '');
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        executar(() => atualizarDadosLead(lead.id, { nome, email }), fechar);
      }}
    >
      <Campo id="lead-nome" rotulo="Nome" erro={campos.nome}>
        <Input
          id="lead-nome"
          value={nome}
          maxLength={120}
          onChange={(e) => setNome(e.target.value)}
        />
      </Campo>
      <Campo id="lead-email" rotulo="E-mail (opcional)" erro={campos.email}>
        <Input
          id="lead-email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Campo>
      <p className="text-muted-foreground text-xs">O WhatsApp é a identidade do lead e não muda.</p>
      <Button type="submit" size="lg" disabled={executando}>
        Salvar
      </Button>
    </form>
  );
}

export function FormProximoContato({ leadId, fechar }: { leadId: string; fechar: () => void }) {
  const { executar, executando, campos } = useAcao();
  const [quando, setQuando] = useState('amanhã 9h');
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        executar(() => definirProximoContato(leadId, { quando }), fechar);
      }}
    >
      <CampoQuando id="proximo-quando" valor={quando} onChange={setQuando} erro={campos.quando} />
      <p className="text-muted-foreground text-xs">Cria a tarefa “Falar com…” nesse horário.</p>
      <Button type="submit" size="lg" disabled={executando || !quando}>
        Marcar próximo contato
      </Button>
    </form>
  );
}

const TITULOS: Record<Exclude<Formulario, null>, string> = {
  tarefa: 'Nova tarefa',
  nota: 'Nova nota',
  visita: 'Agendar visita',
  perdido: 'Marcar como perdido',
  dados: 'Editar dados',
  proximo: 'Próximo contato',
};

/**
 * Ações do lead: barra fixa embaixo no celular (WhatsApp, Registrar contato, + Tarefa e ⋯) e
 * linha de botões no topo do desktop. Cada formulário abre num sheet de um nível só.
 */
export function AcoesLead({ lead }: { lead: LeadParaAcoes }) {
  const { executar } = useAcao();
  const [form, setForm] = useState<Formulario>(null);
  const fechar = () => setForm(null);
  const perdido = lead.status === 'perdido';
  const podePerder = ['novo', 'em_andamento', 'abandonou', 'frio', 'pre_reservado'].includes(
    lead.status,
  );

  return (
    <>
      <div
        className="bg-card md:rounded-card fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t p-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:static md:border md:shadow-none"
        data-testid="barra-acoes"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-[1fr_1fr_1fr_auto] gap-2">
          <BotaoWhatsApp leadId={lead.id} />
          <BotaoRegistrarContato leadId={lead.id} className="px-2 text-xs sm:text-sm" />
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setForm('tarefa')}
          >
            <Plus aria-hidden />
            Tarefa
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                aria-label="Mais ações"
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => setForm('nota')}>
                <NotebookPen aria-hidden /> Nota
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setForm('proximo')}>
                <Timer aria-hidden /> Próximo contato
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setForm('visita')}>
                <CalendarPlus aria-hidden /> Agendar visita
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/app/orcamentos/novo?lead=${lead.id}`}>
                  <FilePlus2 aria-hidden /> Novo orçamento
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setForm('dados')}>
                <Pencil aria-hidden /> Editar dados
              </DropdownMenuItem>
              {podePerder && (
                <DropdownMenuItem onSelect={() => setForm('perdido')} className="text-destructive">
                  <ThumbsDown aria-hidden /> Marcar perdido
                </DropdownMenuItem>
              )}
              {perdido && (
                <DropdownMenuItem onSelect={() => executar(() => reabrirLead(lead.id))}>
                  <RotateCcw aria-hidden /> Reabrir
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Folha
        aberto={form !== null}
        onAbertoChange={(v) => !v && fechar()}
        titulo={form ? TITULOS[form] : ''}
      >
        {form === 'tarefa' && <FormTarefa leadId={lead.id} fechar={fechar} />}
        {form === 'nota' && <FormNota leadId={lead.id} fechar={fechar} />}
        {form === 'visita' && <FormVisita leadId={lead.id} fechar={fechar} />}
        {form === 'perdido' && (
          <FormPerdido leadId={lead.id} temPreReserva={lead.temPreReserva} fechar={fechar} />
        )}
        {form === 'dados' && <FormDados lead={lead} fechar={fechar} />}
        {form === 'proximo' && <FormProximoContato leadId={lead.id} fechar={fechar} />}
      </Folha>
    </>
  );
}
