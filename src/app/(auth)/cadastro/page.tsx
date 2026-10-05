import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BotaoGoogle, DivisorOu } from '@/components/auth/botao-google';
import { CapturaOrigem } from '@/components/marketing/rastreio';
import { loginGoogleLigado } from '@/lib/login-google';
import { FormCadastro } from './form-cadastro';

export const metadata: Metadata = { title: 'Criar conta' };
// Dinâmica para receber o nonce da CSP (Etapa 9B): página estática sai do cache sem nonce.
export const dynamic = 'force-dynamic';

const AVISO_DEMO: Record<string, string> = {
  fim: 'Sua demonstração de 2 horas terminou. Gostou? Crie sua conta e use com o seu buffet.',
  indisponivel:
    'A demonstração está indisponível agora. Crie sua conta grátis e teste com o seu buffet.',
  limite:
    'Muitas entradas na demonstração agora. Crie sua conta grátis ou tente de novo mais tarde.',
};

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const aviso = demo ? AVISO_DEMO[demo] : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Crie sua conta</h1>
        </CardTitle>
        <CardDescription>
          14 dias grátis, sem cartão. Seu link fica pronto em minutos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {aviso && (
          <p
            role="status"
            data-testid="aviso-demo"
            className="bg-info/10 text-info border-info/30 rounded-lg border px-3 py-2 text-sm"
          >
            {aviso}
          </p>
        )}
        {/* link de anúncio direto para o cadastro: guarda a origem também aqui */}
        <CapturaOrigem />
        {loginGoogleLigado() && (
          <>
            <BotaoGoogle next="/app/comecar" />
            <DivisorOu />
          </>
        )}
        <FormCadastro />
        <p className="text-muted-foreground text-center text-sm">
          Já tem conta?{' '}
          <Link href="/login" className="text-primary-texto font-semibold hover:underline">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
