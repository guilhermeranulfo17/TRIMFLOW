'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { aceitarTermos } from '@/server/actions/lgpd';
import { AvisoForm } from './aviso-form';

const LINK = 'text-primary-texto font-semibold underline-offset-2 hover:underline';

/** Aceite dos Termos e da Privacidade vigentes (grava versão e data; depois vai ao painel). */
export function FormAceite() {
  const [marcado, setMarcado] = useState(false);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!marcado) {
          setErro('Para continuar, marque que leu e aceita os termos.');
          return;
        }
        iniciar(async () => {
          const r = await aceitarTermos();
          if (r && !r.ok) setErro(r.erro);
        });
      }}
    >
      <ul className="flex flex-col gap-2 text-sm">
        <li>
          <Link href="/termos" target="_blank" className={LINK}>
            Termos de Uso
          </Link>{' '}
          (inclui o acordo de tratamento de dados)
        </li>
        <li>
          <Link href="/privacidade" target="_blank" className={LINK}>
            Política de Privacidade
          </Link>
        </li>
        <li>
          <Link href="/subprocessadores" target="_blank" className={LINK}>
            Subprocessadores
          </Link>
        </li>
      </ul>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={marcado}
          onChange={(e) => {
            setMarcado(e.target.checked);
            setErro(undefined);
          }}
          className="accent-primary mt-0.5 size-4 shrink-0"
        />
        <span>Li e aceito os Termos de Uso e a Política de Privacidade.</span>
      </label>
      {erro && <AvisoForm tipo="erro">{erro}</AvisoForm>}
      <Button type="submit" disabled={pendente} className="min-h-11">
        Aceitar e continuar
      </Button>
    </form>
  );
}
