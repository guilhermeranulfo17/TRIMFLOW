'use client';

import { Download, ShieldX } from 'lucide-react';
import { useState } from 'react';
import { Folha } from '@/components/app/agenda/folha';
import { Campo } from '@/components/app/form/campo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apagarDadosDoLead } from '@/server/actions/lgpd';
import { useAcao } from './acoes-lead';

const LINK =
  'border-input bg-card hover:bg-muted rounded-control inline-flex min-h-11 items-center gap-2 border px-3 text-sm font-semibold';

/**
 * LGPD no detalhe do lead (só o dono): exportar os dados para o titular (JSON e CSV) e apagar a
 * pedido dele. O buffet é o controlador; o pedido fica na auditoria.
 */
export function PrivacidadeLead({ leadId, anonimizado }: { leadId: string; anonimizado: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');
  const { executar, executando, campos } = useAcao();

  return (
    <section aria-labelledby="titulo-privacidade" data-testid="privacidade-lead">
      <h2 id="titulo-privacidade" className="font-bold">
        Privacidade (LGPD)
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Se o cliente pedir, envie os dados dele ou apague. Só o dono vê esta parte.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`/app/leads/${leadId}/exportar?formato=json`} className={LINK} download>
          <Download className="size-4" aria-hidden /> Exportar dados (JSON)
        </a>
        <a href={`/app/leads/${leadId}/exportar?formato=csv`} className={LINK} download>
          <Download className="size-4" aria-hidden /> Exportar dados (CSV)
        </a>
        {!anonimizado && (
          <Button type="button" variant="outline" onClick={() => setAberto(true)}>
            <ShieldX aria-hidden /> Apagar a pedido do titular
          </Button>
        )}
      </div>

      <Folha
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo="Apagar os dados deste cliente"
        descricao="Nome, WhatsApp, e-mail, notas e textos livres são apagados para sempre. Datas, valores e o status ficam (seus Números não mudam). Não dá para desfazer."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            executar(
              () => apagarDadosDoLead(leadId, confirmacao),
              () => setAberto(false),
            );
          }}
        >
          <Campo
            id="confirmacao-apagar"
            rotulo="Para confirmar, digite APAGAR"
            erro={campos.confirmacao}
          >
            <Input
              id="confirmacao-apagar"
              value={confirmacao}
              autoComplete="off"
              onChange={(e) => setConfirmacao(e.target.value)}
            />
          </Campo>
          <Button type="submit" variant="destructive" disabled={executando}>
            Apagar dados
          </Button>
        </form>
      </Folha>
    </section>
  );
}
