'use client';

import { useEffect, useState, useTransition } from 'react';
import { Campo } from '@/components/app/form/campo';
import { classeCampo } from '@/components/app/form/estilos';
import { useToast } from '@/components/app/toast';
import { confirmarMfa, entrarInterno, iniciarCadastroMfa } from '@/server/actions/interno';

const BOTAO =
  'bg-primary text-primary-foreground rounded-control min-h-11 w-full px-4 font-semibold disabled:opacity-60';

export function FormEntrarInterno() {
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await entrarInterno({ email, senha });
          if (r && !r.ok) toast.erro(r.erro);
        });
      }}
    >
      <Campo id="email" rotulo="E-mail">
        <input
          id="email"
          type="email"
          autoComplete="username"
          className={classeCampo}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Campo>
      <Campo id="senha" rotulo="Senha">
        <input
          id="senha"
          type="password"
          autoComplete="current-password"
          className={classeCampo}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />
      </Campo>
      <button type="submit" disabled={pendente} className={BOTAO}>
        {pendente ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

function CampoCodigo({ fatorId }: { fatorId: string | null }) {
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [codigo, setCodigo] = useState('');
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await confirmarMfa({ codigo, fatorId });
          if (r && !r.ok) toast.erro(r.erro);
        });
      }}
    >
      <Campo id="codigo" rotulo="Código de 6 números do aplicativo">
        <input
          id="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className={`${classeCampo} text-center text-2xl tracking-[0.5em]`}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
          required
        />
      </Campo>
      <button type="submit" disabled={pendente || codigo.length !== 6} className={BOTAO}>
        {pendente ? 'Conferindo…' : 'Confirmar'}
      </button>
    </form>
  );
}

/** Confirmar o TOTP já cadastrado. */
export function FormCodigoMfa() {
  return <CampoCodigo fatorId={null} />;
}

/** Cadastrar o TOTP: QR para o aplicativo autenticador + segredo para digitar. */
export function CadastroMfa() {
  const [dados, setDados] = useState<{ fatorId: string; qr: string; segredo: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    iniciarCadastroMfa().then((r) => (r.ok ? setDados(r) : setErro(r.erro)));
  }, []);
  if (erro) return <p className="text-destructive text-sm">{erro}</p>;
  if (!dados) return <p className="text-muted-foreground text-sm">Preparando o código…</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Abra o aplicativo autenticador (Google Authenticator, 1Password, Authy…) e leia o QR.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- QR em SVG gerado pelo Auth */}
      <img
        src={dados.qr}
        alt="QR code do autenticador"
        className="mx-auto size-48 rounded bg-white p-2"
      />
      <p className="text-muted-foreground text-center text-xs">
        Sem câmera? Digite o código:{' '}
        <code className="text-foreground break-all" data-testid="segredo-mfa">
          {dados.segredo}
        </code>
      </p>
      <CampoCodigo fatorId={dados.fatorId} />
    </div>
  );
}
