'use client';

import { Loader2, Mail, PenLine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/publico/marca';
import { mascaraCpf } from '@/domain/mascara';
import {
  assinarContrato,
  pedirCodigoContrato,
  recusarContrato,
} from '@/server/actions/contrato-publico';

/*
 * Bloco "Assinar" da página do contrato (o único pedaço com JavaScript). Nome completo, CPF,
 * "li e concordo" e, se o buffet pediu, o código de 6 dígitos por e-mail. O hash enviado é o do
 * texto que a pessoa leu: se o contrato mudou, o banco recusa.
 */

const CAMPO =
  'mt-1 h-12 w-full rounded-control border border-input bg-white px-3 text-base focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-[invalid=true]:border-erro';

type Props = {
  slug: string;
  token: string;
  hash: string;
  exigeCodigo: boolean;
  emailMascarado: string | null;
  modoTeste: boolean;
  buffet: string;
};

export function AssinarContrato(p: Props) {
  const router = useRouter();
  const id = useId();
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [aceite, setAceite] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [codigoEnviado, setCodigoEnviado] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<'fechado' | 'aberto' | 'enviado'>('fechado');
  const [motivo, setMotivo] = useState('');
  const [pendente, iniciar] = useTransition();
  const [enviandoCodigo, iniciarCodigo] = useTransition();

  function pedirCodigo() {
    setErro(null);
    iniciarCodigo(async () => {
      const r = await pedirCodigoContrato(p.slug, p.token);
      if (r.ok) {
        setCodigoEnviado(r.dados?.email ?? p.emailMascarado);
        setAviso(
          `Enviamos um código para ${r.dados?.email ?? 'o seu e-mail'}. Ele vale por 10 minutos.`,
        );
      } else setErro(r.erro);
    });
  }

  function assinar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await assinarContrato(p.slug, p.token, {
        nome,
        cpf,
        aceite,
        codigo: p.exigeCodigo ? codigo : '',
        hash: p.hash,
      });
      if (r.ok) {
        router.refresh();
        return;
      }
      setCampos(r.campos ?? {});
      setErro(r.erro);
    });
  }

  function pedirAjuste() {
    setErro(null);
    iniciar(async () => {
      const r = await recusarContrato(p.slug, p.token, motivo);
      if (r.ok) {
        setAjuste('enviado');
        router.refresh();
      } else setErro(r.erro);
    });
  }

  const invalido = (c: string) => (campos[c] ? true : undefined);
  const msg = (c: string) =>
    campos[c] ? (
      <p id={`${id}-${c}-erro`} className="text-erro mt-1 text-sm font-semibold">
        {campos[c]}
      </p>
    ) : null;

  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="rounded-card mt-8 border bg-white p-4 shadow-sm sm:p-6"
      data-testid="bloco-assinar"
    >
      <h2 id={`${id}-titulo`} className="flex items-center gap-2 text-xl font-extrabold">
        <PenLine className="text-primary-texto size-5" aria-hidden />
        Assinar
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Assinatura eletrônica com registro de data, hora e identificação.
      </p>
      {p.modoTeste && (
        <p role="status" className="rounded-control mt-3 border p-3 text-sm font-semibold">
          Modo teste: você é do {p.buffet}, então a assinatura fica desligada aqui.
        </p>
      )}

      <form onSubmit={assinar} noValidate className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor={`${id}-nome`} className="font-semibold">
            Nome completo
          </label>
          <input
            id={`${id}-nome`}
            name="nome"
            autoComplete="name"
            className={CAMPO}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            aria-invalid={invalido('nome')}
            aria-describedby={campos.nome ? `${id}-nome-erro` : undefined}
            maxLength={120}
            required
          />
          {msg('nome')}
        </div>
        <div>
          <label htmlFor={`${id}-cpf`} className="font-semibold">
            CPF
          </label>
          <input
            id={`${id}-cpf`}
            name="cpf"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            className={CAMPO}
            value={cpf}
            onChange={(e) => setCpf(mascaraCpf(e.target.value))}
            aria-invalid={invalido('cpf')}
            aria-describedby={campos.cpf ? `${id}-cpf-erro` : `${id}-cpf-ajuda`}
            required
          />
          <p id={`${id}-cpf-ajuda`} className="text-muted-foreground mt-1 text-sm">
            Fica guardado com segurança e aparece mascarado no comprovante.
          </p>
          {msg('cpf')}
        </div>

        {p.exigeCodigo && (
          <div className="rounded-control border p-3">
            <p className="text-sm">
              Para confirmar que é você, o buffet pediu um código enviado para{' '}
              <strong>{p.emailMascarado ?? 'o seu e-mail'}</strong>.
            </p>
            <button
              type="button"
              className={`${BOTAO_SECUNDARIO} mt-3 w-full`}
              onClick={pedirCodigo}
              disabled={enviandoCodigo || p.modoTeste}
              data-testid="enviar-codigo"
            >
              {enviandoCodigo ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Mail className="size-4" aria-hidden />
              )}
              {codigoEnviado ? 'Enviar outro código' : 'Enviar código para o meu e-mail'}
            </button>
            <label htmlFor={`${id}-codigo`} className="mt-3 block font-semibold">
              Código de 6 números
            </label>
            <input
              id={`${id}-codigo`}
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              className={`${CAMPO} tracking-[0.3em]`}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-invalid={invalido('codigo')}
              aria-describedby={campos.codigo ? `${id}-codigo-erro` : undefined}
              maxLength={6}
            />
            {msg('codigo')}
          </div>
        )}

        <div>
          <label className="flex min-h-12 items-start gap-3">
            <input
              type="checkbox"
              name="aceite"
              className="accent-primary mt-1 size-5 shrink-0"
              checked={aceite}
              onChange={(e) => setAceite(e.target.checked)}
              aria-invalid={invalido('aceite')}
              aria-describedby={campos.aceite ? `${id}-aceite-erro` : undefined}
            />
            <span className="font-semibold">Li e concordo com este contrato.</span>
          </label>
          {msg('aceite')}
        </div>

        {aviso && (
          <p role="status" className="rounded-control bg-accent p-3 text-sm font-semibold">
            {aviso}
          </p>
        )}
        {erro && (
          <p role="alert" className="text-erro text-sm font-semibold" data-testid="erro-assinar">
            {erro}
          </p>
        )}

        <button
          type="submit"
          className={`${BOTAO_PRINCIPAL} w-full`}
          disabled={pendente || p.modoTeste}
          data-testid="assinar-contrato"
        >
          {pendente && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Assinar contrato
        </button>
      </form>

      <div className="mt-6 border-t pt-4">
        {ajuste === 'fechado' && (
          <button
            type="button"
            className="text-muted-foreground min-h-12 w-full text-sm font-semibold underline underline-offset-4"
            onClick={() => setAjuste('aberto')}
            disabled={p.modoTeste}
          >
            Não concordo / Pedir ajuste
          </button>
        )}
        {ajuste === 'aberto' && (
          <div className="flex flex-col gap-3">
            <label htmlFor={`${id}-motivo`} className="font-semibold">
              O que precisa mudar? (opcional)
            </label>
            <textarea
              id={`${id}-motivo`}
              className="rounded-control border-input focus-visible:ring-ring/50 min-h-24 w-full border bg-white p-3 text-base focus-visible:ring-[3px] focus-visible:outline-none"
              value={motivo}
              maxLength={500}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <p className="text-muted-foreground text-sm">
              O {p.buffet} recebe o seu pedido e manda um contrato novo, se for o caso.
            </p>
            <button
              type="button"
              className={`${BOTAO_SECUNDARIO} w-full`}
              onClick={pedirAjuste}
              disabled={pendente}
              data-testid="confirmar-ajuste"
            >
              Enviar pedido de ajuste
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
