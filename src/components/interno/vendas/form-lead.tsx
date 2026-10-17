'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CampoTelefone } from '@/components/app/campos';
import { Campo, CampoCheck } from '@/components/app/form/campo';
import { classeCampo } from '@/components/app/form/estilos';
import { useToast } from '@/components/app/toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { LeadVendasEntrada } from '@/domain/vendas/lead';
import { atualizarLeadVendas, criarLeadVendas } from '@/server/actions/vendas';

const BOTAO =
  'bg-primary text-primary-foreground rounded-control min-h-11 px-5 font-semibold disabled:opacity-60';

/** Cadastro e edição do lead de vendas. Sem `id`, cria; com `id`, salva as mudanças. */
export function FormLeadVendas({ id, inicial }: { id?: string; inicial: LeadVendasEntrada }) {
  const toast = useToast();
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [lead, setLead] = useState(inicial);
  const [erros, setErros] = useState<Record<string, string>>({});
  const mudar = <K extends keyof LeadVendasEntrada>(campo: K, valor: LeadVendasEntrada[K]) =>
    setLead((l) => ({ ...l, [campo]: valor }));

  return (
    <form
      className="bg-card rounded-card flex flex-col gap-4 border p-4"
      data-testid="form-lead-vendas"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = id ? await atualizarLeadVendas(id, lead) : await criarLeadVendas(lead);
          if (!r.ok) {
            setErros(r.campos ?? {});
            toast.erro(r.erro);
            return;
          }
          setErros({});
          toast.sucesso(r.mensagem);
          if (!id) router.push('/interno/vendas/leads');
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nome" rotulo="Nome" erro={erros.nome}>
          <Input
            id="nome"
            value={lead.nome}
            onChange={(e) => mudar('nome', e.target.value)}
            aria-invalid={!!erros.nome || undefined}
            maxLength={120}
            required
          />
        </Campo>
        <Campo id="buffet" rotulo="Buffet" erro={erros.buffet}>
          <Input
            id="buffet"
            value={lead.buffet}
            onChange={(e) => mudar('buffet', e.target.value)}
            maxLength={160}
          />
        </Campo>
        <Campo id="telefone" rotulo="Telefone (WhatsApp)" erro={erros.telefone}>
          <CampoTelefone
            id="telefone"
            valor={lead.telefone}
            onChange={(v) => mudar('telefone', v)}
            invalido={!!erros.telefone}
          />
        </Campo>
        <Campo id="cidade" rotulo="Cidade" erro={erros.cidade}>
          <Input
            id="cidade"
            value={lead.cidade}
            onChange={(e) => mudar('cidade', e.target.value)}
            maxLength={120}
          />
        </Campo>
        <Campo
          id="origem"
          rotulo="Origem"
          erro={erros.origem}
          dica="Ex.: Instagram, indicação, Google Maps."
        >
          <Input
            id="origem"
            value={lead.origem}
            onChange={(e) => mudar('origem', e.target.value)}
            maxLength={80}
          />
        </Campo>
        <Campo id="proximoFollowup" rotulo="Próximo follow-up" erro={erros.proximoFollowup}>
          <input
            id="proximoFollowup"
            type="date"
            className={classeCampo}
            value={lead.proximoFollowup}
            onChange={(e) => mudar('proximoFollowup', e.target.value)}
          />
        </Campo>
      </div>
      <Campo id="resumo" rotulo="Resumo" erro={erros.resumo}>
        <Textarea
          id="resumo"
          rows={3}
          value={lead.resumo}
          onChange={(e) => mudar('resumo', e.target.value)}
          maxLength={2000}
        />
      </Campo>
      <CampoCheck
        id="naoContatar"
        rotulo="Não contatar"
        dica="O lead pediu para parar. O copiloto não gera mensagem para ele."
        checked={lead.naoContatar}
        onChange={(e) => mudar('naoContatar', e.target.checked)}
      />
      <div>
        <button type="submit" disabled={pendente} className={BOTAO}>
          {pendente ? 'Salvando…' : id ? 'Salvar' : 'Cadastrar lead'}
        </button>
      </div>
    </form>
  );
}
