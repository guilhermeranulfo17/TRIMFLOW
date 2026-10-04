import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { FormAceite } from '@/components/auth/form-aceite';
import { Logo } from '@/components/app/logo';
import { dataDaVersao, precisaAceitarTermos } from '@/domain/legal/versao';
import { exigirSessao } from '@/server/auth/sessao';

export const metadata: Metadata = { title: 'Termos atualizados' };

/**
 * O dono aceita a versão vigente dos Termos e da Privacidade (versão e data gravadas). O painel
 * manda para cá enquanto a versão aceita for outra (ou nenhuma).
 */
export default async function AceitePage() {
  const usuario = await exigirSessao();
  if (!precisaAceitarTermos(usuario.perfil, usuario.termosVersao) || usuario.suporte) {
    redirect('/app/leads');
  }
  const primeiro = !usuario.termosVersao;
  return (
    <>
      <Logo />
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {primeiro ? 'Antes de continuar' : 'Atualizamos nossos termos'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {primeiro
            ? 'Para usar o Orkestra, leia e aceite os Termos de Uso e a Política de Privacidade.'
            : `Os Termos de Uso e a Política de Privacidade mudaram em ${dataDaVersao()}. Leia e aceite para continuar usando o Orkestra.`}{' '}
          Eles explicam como tratamos os dados dos seus clientes em nome do seu buffet (LGPD).
        </p>
      </div>
      <FormAceite />
    </>
  );
}
