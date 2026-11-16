import { Flame, MessageCircle } from 'lucide-react';
import { ROTULO_ETAPA } from '@/domain/leads/funil';
import { cn } from '@/lib/utils';

/*
 * Maquete da landing (§95): desenho em HTML e CSS do painel, não captura.
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
