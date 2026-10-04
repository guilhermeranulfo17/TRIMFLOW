import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { DesligarMfa, LigarMfa } from '@/components/auth/mfa';
import { exigirPerfil } from '@/server/auth/guards';
import { criarClienteSupabase } from '@/server/auth/supabase-server';

export const metadata: Metadata = { title: 'Segurança' };

/** Minha conta → Segurança (dono): verificação em duas etapas opcional (TOTP). */
export default async function ContaSegurancaPage() {
  await exigirPerfil('dono');
  const supabase = await criarClienteSupabase();
  const { data } = await supabase.auth.mfa.listFactors();
  const ligada = !!data?.totp.some((f) => f.status === 'verified');

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <TituloPagina>Segurança da conta</TituloPagina>
      <section
        aria-labelledby="titulo-mfa"
        className="bg-card rounded-card flex flex-col gap-3 p-4 md:p-5"
        data-testid="mfa-conta"
      >
        <div>
          <h2 id="titulo-mfa" className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="size-5" aria-hidden />
            Verificação em duas etapas
            <span
              className={
                ligada
                  ? 'bg-sucesso/10 text-sucesso border-sucesso/30 rounded-full border px-2 py-0.5 text-xs'
                  : 'bg-muted text-muted-foreground rounded-full border px-2 py-0.5 text-xs'
              }
              data-testid="estado-mfa"
            >
              {ligada ? 'Ligada' : 'Desligada'}
            </span>
          </h2>
          <p className="text-muted-foreground text-sm">
            {ligada
              ? 'Ao entrar num aparelho novo, pedimos a senha e um código do seu aplicativo autenticador. Para desligar, digite um código atual.'
              : 'Além da senha, peça um código do aplicativo autenticador do seu celular ao entrar. Se alguém descobrir sua senha, ainda assim não entra.'}
          </p>
        </div>
        {ligada ? <DesligarMfa /> : <LigarMfa />}
      </section>
    </div>
  );
}
