'use client';

import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CampoDinheiro } from '@/components/app/campos/campo-dinheiro';
import { useToast } from '@/components/app/toast';
import { Button } from '@/components/ui/button';
import { FORMAS_PAGAMENTO, ROTULO_FORMA, type FormaPagamento } from '@/domain/financeiro';
import { registrarRecebimento } from '@/server/actions/financeiro';

const CAMPO =
  'rounded-control border-input bg-background focus-visible:ring-ring/50 mt-1 block h-11 w-full border px-3 text-base font-normal focus-visible:ring-[3px] focus-visible:outline-none';

/** Lançar um pagamento recebido (valor sugerido: o que falta da próxima parcela). */
export function RegistrarPagamento({
  reservaId,
  hoje,
  sugestaoCentavos,
}: {
  reservaId: string;
  hoje: string;
  sugestaoCentavos: number | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [valor, setValor] = useState<number | null>(sugestaoCentavos);
  const [data, setData] = useState(hoje);
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!valor || valor <= 0) {
      setErro('Informe o valor recebido.');
      return;
    }
    iniciar(async () => {
      const r = await registrarRecebimento({
        reservaId,
        valorCentavos: valor,
        recebidoEm: data,
        forma,
        observacao: obs,
      });
      if (r.ok) {
        toast.sucesso(r.mensagem);
        setObs('');
        router.refresh();
      } else setErro(r.erro);
    });
  }

  return (
    <form
      onSubmit={salvar}
      className="bg-card rounded-card flex flex-col gap-3 border p-4"
      aria-labelledby="titulo-registrar"
      data-testid="registrar-pagamento"
    >
      <h2 id="titulo-registrar" className="font-bold">
        Registrar pagamento
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-semibold" htmlFor="pagamento-valor">
          Valor
          <span className="mt-1 block">
            <CampoDinheiro id="pagamento-valor" valor={valor} onChange={setValor} />
          </span>
        </label>
        <label className="text-sm font-semibold">
          Recebido em
          <input
            type="date"
            className={CAMPO}
            value={data}
            max={hoje}
            onChange={(e) => setData(e.target.value)}
          />
        </label>
        <label className="text-sm font-semibold">
          Forma
          <select
            className={CAMPO}
            value={forma}
            onChange={(e) => setForma(e.target.value as FormaPagamento)}
          >
            {FORMAS_PAGAMENTO.map((f) => (
              <option key={f} value={f}>
                {ROTULO_FORMA[f]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-sm font-semibold">
        Observação (opcional)
        <input
          className={CAMPO}
          value={obs}
          maxLength={200}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ex.: comprovante no WhatsApp"
        />
      </label>
      {erro && (
        <p className="text-erro text-sm font-semibold" role="alert">
          {erro}
        </p>
      )}
      <Button
        type="submit"
        disabled={pendente}
        className="min-h-12 sm:w-fit"
        data-testid="salvar-pagamento"
      >
        {pendente ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Plus className="size-4" aria-hidden />
        )}
        Registrar pagamento
      </Button>
    </form>
  );
}
