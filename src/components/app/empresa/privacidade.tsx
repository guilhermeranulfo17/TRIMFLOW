'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Campo } from '@/components/app/form/campo';
import { Secao } from '@/components/app/form/secao';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ResultadoAcao } from '@/server/actions/empresa/comum';
import {
  desistirDaExclusao,
  salvarRetencaoLeads,
  solicitarExclusaoDaConta,
} from '@/server/actions/lgpd';

const PRAZOS = [
  { meses: 12, rotulo: '12 meses' },
  { meses: 24, rotulo: '24 meses (recomendado)' },
  { meses: 36, rotulo: '36 meses' },
  { meses: 60, rotulo: '60 meses' },
];

function useExecutar() {
  const toast = useToast();
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [campos, setCampos] = useState<Record<string, string>>({});
  function executar(acao: () => Promise<ResultadoAcao>) {
    iniciar(async () => {
      const r = await acao();
      if (r.ok) {
        setCampos({});
        toast.sucesso(r.mensagem);
        router.refresh();
      } else {
        setCampos(r.campos ?? {});
        toast.erro(r.erro);
      }
    });
  }
  return { executar, pendente, campos };
}

/** Prazo de guarda dos leads sem reserva (o job diário anonimiza depois disso). */
export function RetencaoLeads({ meses }: { meses: number }) {
  const [valor, setValor] = useState(meses);
  const { executar, pendente } = useExecutar();
  return (
    <Secao
      titulo="Por quanto tempo guardar os leads"
      descricao="Leads que não viraram reserva e ficaram sem nenhuma atividade por esse prazo têm os dados pessoais apagados sozinhos (nome, WhatsApp, e-mail, notas). Datas e valores ficam, então seus Números não mudam."
      onSubmit={(e) => {
        e.preventDefault();
        executar(() => salvarRetencaoLeads(valor));
      }}
      salvando={pendente}
      sujo={valor !== meses}
    >
      <Campo id="retencao" rotulo="Apagar os dados depois de">
        <select
          id="retencao"
          value={valor}
          onChange={(e) => setValor(Number(e.target.value))}
          className="border-input bg-background rounded-control h-11 w-full max-w-xs border px-3 text-sm"
        >
          {PRAZOS.map((p) => (
            <option key={p.meses} value={p.meses}>
              {p.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <p className="text-muted-foreground text-xs">
        Leads de teste (os que você cria no modo teste do link) são apagados depois de 30 dias.
      </p>
    </Secao>
  );
}

/** Excluir a conta: 30 dias para desistir; a conta fica só leitura nesse tempo. */
export function ExclusaoConta({ agendadaPara }: { agendadaPara: string | null }) {
  const [confirmacao, setConfirmacao] = useState('');
  const { executar, pendente, campos } = useExecutar();

  if (agendadaPara) {
    return (
      <section
        className="rounded-card border-erro/30 bg-erro/10 flex flex-col gap-3 border p-4"
        data-testid="exclusao-agendada"
      >
        <h2 className="text-erro font-bold">Exclusão da conta agendada para {agendadaPara}</h2>
        <p className="text-sm">
          Até lá a conta fica em modo leitura e você pode baixar seus dados. Nesse dia apagamos
          tudo: leads, orçamentos, agenda, fotos e os acessos da sua equipe. Mudou de ideia?
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={pendente}
          onClick={() => executar(() => desistirDaExclusao())}
        >
          Desistir da exclusão
        </Button>
      </section>
    );
  }

  return (
    <Secao
      titulo="Excluir a conta"
      descricao="Apaga o buffet e todos os dados em 30 dias. Nesse prazo a conta fica em modo leitura (dá para exportar) e você pode desistir. A assinatura é cancelada na hora."
      onSubmit={(e) => {
        e.preventDefault();
        executar(() => solicitarExclusaoDaConta(confirmacao));
      }}
      salvando={pendente}
      textoBotao="Excluir a conta"
    >
      <Campo
        id="confirmacao-excluir"
        rotulo="Para confirmar, digite EXCLUIR"
        erro={campos.confirmacao}
      >
        <Input
          id="confirmacao-excluir"
          value={confirmacao}
          autoComplete="off"
          onChange={(e) => setConfirmacao(e.target.value)}
          className="max-w-xs"
        />
      </Campo>
    </Secao>
  );
}
