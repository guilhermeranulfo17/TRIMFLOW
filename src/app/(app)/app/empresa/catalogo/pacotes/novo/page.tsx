import { Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/app/empty-state';
import { CabecalhoEditor } from '@/components/app/empresa/cabecalho-editor';
import { exigirSessao } from '@/server/auth/sessao';
import { FormDadosPacote } from '../form-dados-pacote';

export const metadata: Metadata = { title: 'Novo pacote' };

export default async function NovoPacotePage() {
  const usuario = await exigirSessao();
  if (usuario.perfil !== 'dono') {
    return (
      <EmptyState icone={Lock} titulo="Acesso restrito">
        Só o dono do buffet pode criar pacotes.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-6">
      <CabecalhoEditor
        titulo="Novo pacote"
        subtitulo="Comece pelo nome. Depois você define preço, fotos e cardápio."
      />
      <FormDadosPacote
        pacoteId={null}
        somenteLeitura={false}
        inicial={{ nome: '', subtitulo: '', descricao: '', destaque: false, ativo: true }}
      />
    </div>
  );
}
