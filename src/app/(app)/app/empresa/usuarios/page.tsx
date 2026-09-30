import { asc, desc } from 'drizzle-orm';
import { Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/app/empty-state';
import { exigirSessao } from '@/server/auth/sessao';
import { usuarios } from '@/server/db/schema';
import { comUsuario } from '@/server/db/tenant';
import { ListaUsuarios } from './lista-usuarios';
import { NovoVendedor } from './novo-vendedor';

export const metadata: Metadata = { title: 'Usuários' };

export default async function UsuariosPage() {
  const usuario = await exigirSessao();
  if (usuario.perfil !== 'dono') {
    return (
      <EmptyState icone={Lock} titulo="Acesso restrito">
        Só o dono do buffet pode gerenciar usuários.
      </EmptyState>
    );
  }
  const lista = await comUsuario(usuario.id, (tx) =>
    tx
      .select()
      .from(usuarios)
      .orderBy(asc(usuarios.perfil), desc(usuarios.ativo), asc(usuarios.nome)),
  );
  const vendedores = lista.filter((u) => u.perfil === 'vendedor').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Quem acessa o painel. Vendedores veem a configuração, mas não alteram.
        </p>
        <NovoVendedor />
      </div>
      <ListaUsuarios
        usuarioAtualId={usuario.id}
        usuarios={lista.map((u) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          whatsappE164: u.whatsappE164,
          perfil: u.perfil,
          ativo: u.ativo,
          limiteDescontoBp: Math.round(Number(u.limiteDescontoPct) * 100),
        }))}
      />
      {vendedores === 0 && (
        <p className="rounded-card text-muted-foreground border border-dashed px-4 py-6 text-center text-sm">
          Nenhum vendedor ainda. Crie um acesso para quem atende seus clientes.
        </p>
      )}
    </div>
  );
}
