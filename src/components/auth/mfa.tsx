'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Campo } from '@/components/app/form/campo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  confirmarMfaConta,
  desativarMfaConta,
  iniciarMfaConta,
  verificarCodigoLogin,
  type CadastroIniciado,
  type ResultadoMfa,
} from '@/server/actions/mfa';
import { AvisoForm } from './aviso-form';

/** Campo do código de 6 números (teclado numérico, preenchimento do celular). */
function CampoCodigo({
  id,
  valor,
  mudar,
}: {
  id: string;
  valor: string;
  mudar: (v: string) => void;
}) {
  return (
    <Campo id={id} rotulo="Código de 6 números do aplicativo">
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        className="h-12 text-center text-2xl tracking-[0.5em]"
        value={valor}
        onChange={(e) => mudar(e.target.value.replace(/\D/g, ''))}
      />
    </Campo>
  );
}

function useEnvio() {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();
  const [sucesso, setSucesso] = useState<string>();
  const router = useRouter();
  function enviar(acao: () => Promise<ResultadoMfa | undefined>) {
    setErro(undefined);
    iniciar(async () => {
      const r = await acao();
      if (!r) return;
      if (r.ok) {
        setSucesso(r.mensagem);
        router.refresh();
      } else setErro(r.erro);
    });
  }
  return { pendente, erro, sucesso, enviar };
}

/** Ligar: QR do aplicativo autenticador + segredo para digitar + primeiro código. */
export function LigarMfa() {
  const [cadastro, setCadastro] = useState<Extract<CadastroIniciado, { ok: true }> | null>(null);
  const [codigo, setCodigo] = useState('');
  const { pendente, erro, enviar } = useEnvio();
  const [iniciando, iniciar] = useTransition();
  const [erroInicio, setErroInicio] = useState<string>();

  if (!cadastro) {
    return (
      <div className="flex flex-col gap-3">
        {erroInicio && <AvisoForm tipo="erro">{erroInicio}</AvisoForm>}
        <Button
          type="button"
          className="w-fit"
          disabled={iniciando}
          onClick={() =>
            iniciar(async () => {
              const r = await iniciarMfaConta();
              if (r.ok) setCadastro(r);
              else setErroInicio(r.erro);
            })
          }
        >
          Ligar a verificação em duas etapas
        </Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        enviar(() => confirmarMfaConta({ fatorId: cadastro.fatorId, codigo }));
      }}
    >
      <p className="text-muted-foreground text-sm">
        Abra o aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…) e
        leia o QR. Depois digite o código que aparecer.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- QR em SVG gerado pelo Auth */}
      <img
        src={cadastro.qr}
        alt="QR code para o aplicativo autenticador"
        className="size-48 rounded bg-white p-2"
      />
      <p className="text-muted-foreground text-xs">
        Sem câmera? Digite este código no aplicativo:{' '}
        <code className="text-foreground break-all" data-testid="segredo-mfa">
          {cadastro.segredo}
        </code>
      </p>
      <CampoCodigo id="codigo-ligar" valor={codigo} mudar={setCodigo} />
      {erro && <AvisoForm tipo="erro">{erro}</AvisoForm>}
      <Button type="submit" className="w-fit" disabled={pendente || codigo.length !== 6}>
        Confirmar e ligar
      </Button>
    </form>
  );
}

/** Desligar: pede um código atual (quem só tem a senha não desliga). */
export function DesligarMfa() {
  const [codigo, setCodigo] = useState('');
  const { pendente, erro, enviar } = useEnvio();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        enviar(() => desativarMfaConta(codigo));
      }}
    >
      <CampoCodigo id="codigo-desligar" valor={codigo} mudar={setCodigo} />
      {erro && <AvisoForm tipo="erro">{erro}</AvisoForm>}
      <Button
        type="submit"
        variant="outline"
        className="w-fit"
        disabled={pendente || codigo.length !== 6}
      >
        Desligar
      </Button>
    </form>
  );
}

/** Segundo passo do login. */
export function FormVerificacaoLogin({ next }: { next: string | null }) {
  const [codigo, setCodigo] = useState('');
  const { pendente, erro, enviar } = useEnvio();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        enviar(() => verificarCodigoLogin({ codigo, next }));
      }}
    >
      <CampoCodigo id="codigo-login" valor={codigo} mudar={setCodigo} />
      {erro && <AvisoForm tipo="erro">{erro}</AvisoForm>}
      <Button type="submit" className="min-h-11" disabled={pendente || codigo.length !== 6}>
        {pendente ? 'Conferindo…' : 'Entrar'}
      </Button>
    </form>
  );
}
