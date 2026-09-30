import { Building2, Calculator } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/app/empty-state';
import { TituloPagina } from '@/components/app/titulo-pagina';
import { exigirSessao } from '@/server/auth/sessao';

export const metadata: Metadata = { title: 'Minha empresa' };

export default async function EmpresaPage() {
  const usuario = await exigirSessao();
  return (
    <>
      <TituloPagina>Minha empresa</TituloPagina>
      <EmptyState icone={Building2} titulo="Configure seu buffet">
        Aqui você vai ajustar identidade, espaços e turnos, pacotes e opcionais, preços e regras,
        seu link de divulgação e os usuários da equipe.
      </EmptyState>
      {usuario.perfil === 'dono' && (
        <p className="mt-6 text-center text-sm">
          <Link
            href="/app/empresa/simulador"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
          >
            <Calculator className="size-4" aria-hidden />
            Simulador de preço (teste)
          </Link>
        </p>
      )}
    </>
  );
}
