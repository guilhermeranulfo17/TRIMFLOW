import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormLogin } from './form-login';

export const metadata: Metadata = { title: 'Entrar' };

const AVISOS: Record<string, string> = {
  'sem-acesso': 'Sua conta não tem acesso ao painel. Fale com o dono do buffet.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const { next, erro } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Entrar</CardTitle>
        <CardDescription>Acesse o painel do seu buffet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <FormLogin next={next ?? null} avisoInicial={erro ? AVISOS[erro] : undefined} />
        <p className="text-muted-foreground text-center text-sm">
          Ainda não tem conta?{' '}
          <Link href="/cadastro" className="text-primary font-semibold hover:underline">
            Criar conta grátis
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
