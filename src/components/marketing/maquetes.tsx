import { CalendarDays, Check, Flame, MessageCircle, Users } from 'lucide-react';
import { IconeWhatsApp } from '@/components/publico/icone-whatsapp';
import { ROTULO_ETAPA } from '@/domain/leads/funil';
import { cn } from '@/lib/utils';

/*
 * Maquetes da landing (§95): desenhos em HTML e CSS do link público e do painel, não capturas.
 * Só dados fictícios (primeiro nome, sem telefone), marcados com `data-exemplo` e a etiqueta
 * "Exemplo ilustrativo". Os valores são os mesmos do Buffet Exemplo da demonstração.
 */

export function EtiquetaExemplo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border border-current/20 px-2.5 py-0.5 text-[0.7rem] font-semibold tracking-wide uppercase opacity-70',
        className,
      )}
    >
      Exemplo ilustrativo
    </span>
  );
}

/** O link do buffet no celular, com o aviso do pedido chegando por cima. */
export function CelularDoLink() {
  return (
    <div className="relative mx-auto w-full max-w-[19rem]" data-exemplo aria-hidden>
      <div className="rounded-[2.6rem] border border-white/15 bg-[#151815] p-2.5 shadow-[0_50px_120px_-50px_rgb(192_240_90/0.45)]">
        <div className="overflow-hidden rounded-[2.1rem] bg-white text-[#0a0a0a]">
          <div className="bg-[#0f766e] px-5 pt-6 pb-5 text-white">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-white/20 text-sm font-bold">
                BE
              </span>
              <div>
                <p className="text-sm font-bold">Buffet Exemplo</p>
                <p className="text-xs text-white/80">Festas infantis</p>
              </div>
            </div>
            <p className="mt-4 text-lg leading-tight font-bold">Monte o orçamento da sua festa</p>
          </div>
          <div className="space-y-2.5 px-4 pt-4 pb-20">
            <p className="flex items-center gap-2 text-xs text-black/60">
              <CalendarDays className="size-3.5" />
              Sáb, 19/12 · Tarde
              <Users className="ml-2 size-3.5" />
              50 convidados
            </p>
            <div className="rounded-xl border border-black/10 p-3">
              <p className="text-sm font-bold">Alegria</p>
              <p className="text-sm font-semibold text-[#0f766e]">R$ 4.290,00</p>
            </div>
            <div className="flex items-center justify-between rounded-xl border-2 border-[#0f766e] bg-[#0f766e]/5 p-3">
              <div>
                <p className="text-sm font-bold">Super</p>
                <p className="text-sm font-semibold text-[#0f766e]">R$ 4.950,00</p>
              </div>
              <Check className="size-4 text-[#0f766e]" />
            </div>
            <div className="rounded-xl bg-[#0f766e] py-2.5 text-center text-sm font-bold text-white">
              Pedir pré-reserva
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -right-2 bottom-4 w-[15.5rem] rounded-2xl border border-white/10 bg-[#1c221c]/95 p-3 text-white shadow-2xl backdrop-blur sm:-right-10">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ld-verde)]">
          <IconeWhatsApp className="size-4" />
          WhatsApp · agora
        </p>
        <p className="mt-1.5 text-xs font-bold text-[var(--ld-limao)]">
          Nova pré-reserva pelo link
        </p>
        <p className="text-sm font-bold">Mariana · R$ 4.950,00</p>
      </div>
    </div>
  );
}

const COLUNAS = [
  {
    etapa: 'novo' as const,
    leads: [
      { nome: 'Rafaela', festa: 'Aniversário infantil', quando: 'Sáb, 16/01', quente: false },
      { nome: 'Bruno', festa: '15 anos', quando: 'Sex, 05/02', quente: false },
    ],
  },
  {
    etapa: 'conversa' as const,
    leads: [{ nome: 'Camila', festa: 'Aniversário infantil', quando: 'Dom, 24/01', quente: false }],
  },
  {
    etapa: 'proposta' as const,
    leads: [{ nome: 'Juliana', festa: 'Aniversário infantil', quando: 'Sáb, 30/01', quente: true }],
  },
  {
    etapa: 'pre_reserva' as const,
    leads: [
      { nome: 'Mariana', festa: 'Aniversário infantil', quando: 'Sáb, 19/12', quente: false },
    ],
  },
];

/** O Início do painel em funil, com uma tarefa do dia por cima. */
export function PainelDeExemplo() {
  return (
    <div
      className="rounded-[1.75rem] border border-white/10 bg-[#121512] p-3 sm:p-4"
      data-exemplo
      aria-hidden
    >
      <div className="flex items-center justify-between gap-3 px-1 pb-3">
        <p className="text-sm font-bold">Início</p>
        <EtiquetaExemplo className="text-white" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {COLUNAS.map((c) => (
          <div key={c.etapa} className="rounded-2xl bg-white/[0.04] p-2.5">
            <p className="flex items-center justify-between px-1 pb-2 text-xs font-semibold text-white/70">
              {ROTULO_ETAPA[c.etapa]}
              <span className="text-white/40">{c.leads.length}</span>
            </p>
            <div className="space-y-2">
              {c.leads.map((l) => (
                <div key={l.nome} className="rounded-xl bg-[#1c221c] p-2.5">
                  <p className="flex items-center gap-1.5 text-sm font-bold">
                    {l.nome}
                    {l.quente && <Flame className="size-3.5 text-[var(--ld-limao)]" />}
                  </p>
                  <p className="text-xs text-white/60">{l.festa}</p>
                  <p className="mt-1 text-xs text-white/50">{l.quando}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-start gap-3 rounded-2xl bg-[var(--ld-limao)] p-3 text-[#0a0a0a]">
        <MessageCircle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold">Hoje: retornar a proposta da Juliana</p>
          <p className="text-xs">Ela abriu a proposta 3 vezes. A mensagem já está pronta.</p>
        </div>
      </div>
    </div>
  );
}
