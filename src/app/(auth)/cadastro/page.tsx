import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormCadastro } from './form-cadastro';

export const metadata: Metadata = { title: 'Criar conta' };

export default function CadastroPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Crie sua conta</h1>
        </CardTitle>
        <CardDescription>14 dias grátis. Sem cartão de crédito.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
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
