'use client';

import { ExternalLink, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { contratarSolucao } from '@/server/actions/modulos';

const CAMPO =
  'rounded-control border-input bg-background focus-visible:ring-ring/50 mt-1 block h-11 w-full border px-3 text-base font-normal focus-visible:ring-[3px] focus-visible:outline-none';

export type FestaOpcao = { id: string; rotulo: string };

/**
 * Confirmação da compra (só o dono). Cria a fatura no provedor e abre o link; o acesso só é
 * liberado quando o provedor confirmar o pagamento (o retorno desta tela não comprova nada).
 */
export function FormContratar({
  codigo,
  nome,
  pedirDados,
  festas,
}: {
  codigo: string;
  nome: string;
  pedirDados: boolean;
  /** por evento: festas confirmadas futuras (null = mensal) */
  festas: FestaOpcao[] | null;
}) {
  const router = useRouter();
  const [aceite, setAceite] = useState(false);
  const [reservaId, setReservaId] = useState(festas?.[0]?.id ?? '');
  const [dados, setDados] = useState({ nome: '', documento: '', email: '' });
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [concluido, setConcluido] = useState<{ fatura: string | null } | null>(null);
  const [pendente, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCampos({});
    if (!aceite) {
      setErro('Confirme que leu o resumo da compra.');
      return;
    }
    if (festas && !reservaId) {
      setErro('Escolha a festa que será ativada.');
      return;
    }
    iniciar(async () => {
      const r = await contratarSolucao({
        codigo: codigo as never,
        aceite: true,
        reservaId: festas ? reservaId : null,
        dados: pedirDados ? dados : null,
      });
      if (!r.ok) {
        setErro(r.erro);
        setCampos(r.campos ?? {});
        return;
      }
      const url = r.dados?.urlFatura ?? null;
      setConcluido({ fatura: url });
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      router.refresh();
    });
  }

  if (concluido) {
    return (
      <div className="bg-card rounded-card flex flex-col gap-3 border p-5" role="status">
        <h2 className="font-bold">Fatura criada</h2>
        <p className="text-muted-foreground text-sm">
          Pague pelo link do provedor (Pix, boleto ou cartão). O {nome} é liberado quando o
          pagamento for confirmado; você pode acompanhar em Nossas soluções.
        </p>
        <div className="flex flex-wrap gap-2">
          {concluido.fatura && (
            <a
              href={concluido.fatura}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-primary text-primary-foreground inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold"
              data-testid="abrir-fatura"
            >
              Abrir a fatura
              <ExternalLink className="size-4" aria-hidden />
            </a>
          )}
          <a
            href={`/app/solucoes/${codigo}`}
            className="hover:bg-accent inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold"
          >
            Acompanhar a situação
          </a>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={enviar}
      className="bg-card rounded-card flex flex-col gap-4 border p-5"
      data-testid="form-contratar"
    >
      {festas && (
        <label className="text-sm font-semibold">
          Festa que será ativada
          <select
            className={CAMPO}
            value={reservaId}
            onChange={(e) => setReservaId(e.target.value)}
            required
          >
            {festas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.rotulo}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground mt-1 block text-xs font-normal">
            A compra vale só para esta festa.
          </span>
        </label>
      )}

      {pedirDados && (
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-bold">Dados de cobrança</legend>
          {(
            [
              ['nome', 'Nome ou razão social', 'text'],
              ['documento', 'CPF ou CNPJ', 'text'],
              ['email', 'E-mail', 'email'],
            ] as const
          ).map(([k, rotulo, tipo]) => (
            <label key={k} className="text-sm font-semibold">
              {rotulo}
              <input
                className={CAMPO}
                type={tipo}
                value={dados[k]}
                onChange={(e) => setDados((d) => ({ ...d, [k]: e.target.value }))}
                aria-invalid={Boolean(campos[`dados.${k}`]) || undefined}
                required
              />
              {campos[`dados.${k}`] && (
                <span className="text-erro mt-1 block text-xs">{campos[`dados.${k}`]}</span>
              )}
            </label>
          ))}
        </fieldset>
      )}

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="accent-primary-texto mt-0.5 size-5 shrink-0"
          checked={aceite}
          onChange={(e) => setAceite(e.target.checked)}
          data-testid="aceite-compra"
        />
        <span>
          Li o resumo: valor, cobrança, início do acesso, cancelamento e o que não está incluído.
        </span>
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
        data-testid="confirmar-compra"
      >
        {pendente && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Ir para o pagamento
      </Button>
    </form>
  );
}
