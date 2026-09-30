import { Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/app/empty-state';
import { CabecalhoEditor } from '@/components/app/empresa/cabecalho-editor';
import { exigirSessao } from '@/server/auth/sessao';
import { FormDadosOpcional } from '../form-dados-opcional';

export const metadata: Metadata = { title: 'Novo opcional' };

export default async function NovoOpcionalPage() {
  const usuario = await exigirSessao();
  if (usuario.perfil !== 'dono') {
    return (
      <EmptyState icone={Lock} titulo="Acesso restrito">
        Só o dono do buffet pode criar opcionais.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-6">
      <CabecalhoEditor titulo="Novo opcional" />
      <FormDadosOpcional
        opcionalId={null}
        somenteLeitura={false}
        inicial={{
          nome: '',
          descricao: '',
          cobranca: 'fixo',
          precoCentavos: Number.NaN,
          qtdMin: 1,
          qtdMax: null,
          ativo: true,
        }}
      />
    </div>
  );
}
