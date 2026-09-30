import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/app/empty-state';
import { TituloPagina } from '@/components/app/titulo-pagina';

export const metadata: Metadata = { title: 'Minha empresa' };

export default function EmpresaPage() {
  return (
    <>
      <TituloPagina>Minha empresa</TituloPagina>
      <EmptyState icone={Building2} titulo="Configure seu buffet">
        Aqui você vai ajustar identidade, espaços e turnos, pacotes e opcionais, preços e regras,
        seu link de divulgação e os usuários da equipe.
      </EmptyState>
    </>
  );
}
