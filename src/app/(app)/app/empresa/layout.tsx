import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { NavEmpresa, type SecaoEmpresa } from '@/components/app/empresa/nav-empresa';
import type { Pendencia } from '@/domain/catalogo/pendencias';
import { exigirSessao, type UsuarioAtual } from '@/server/auth/sessao';
import { carregarContextoPainel } from '@/server/painel/contexto';

function secoesDe(dono: boolean, pendencias: Pendencia[] = []): SecaoEmpresa[] {
  const contar = (secao: string) => pendencias.filter((p) => p.secao === secao).length;
  return [
    { href: '/app/empresa', rotulo: 'Identidade' },
    {
      href: '/app/empresa/agenda-config',
      rotulo: 'Espaços e turnos',
      badge: contar('agenda-config'),
    },
    { href: '/app/empresa/catalogo', rotulo: 'Catálogo', badge: contar('catalogo') },
    { href: '/app/empresa/regras', rotulo: 'Preços e regras' },
    { href: '/app/empresa/link', rotulo: 'Link e divulgação' },
    { href: '/app/empresa/proposta-exemplo', rotulo: 'Ver minha proposta' },
    { href: '/app/empresa/follow-up', rotulo: 'Follow-up' },
    ...(dono
      ? [
          { href: '/app/empresa/usuarios', rotulo: 'Usuários' },
          { href: '/app/empresa/plano', rotulo: 'Plano' },
          { href: '/app/empresa/simulador', rotulo: 'Simulador' },
        ]
      : []),
  ];
}

/** Navegação com os pontos de pendência (contexto do painel, já lido pelo layout). */
async function NavComPendencias({ usuario }: { usuario: UsuarioAtual }) {
  const { pendencias } = await carregarContextoPainel(usuario);
  return <NavEmpresa secoes={secoesDe(usuario.perfil === 'dono', pendencias)} />;
}

async function AvisoPendencias({ usuario }: { usuario: UsuarioAtual }) {
  const { pendencias } = await carregarContextoPainel(usuario);
  if (pendencias.length === 0) return null;
  return (
    <div
      role="status"
      className="rounded-card border-alerta/40 bg-alerta/10 mb-5 border p-4 text-sm"
    >
      <p className="mb-2 flex items-center gap-2 font-semibold">
        <TriangleAlert className="text-alerta size-4" aria-hidden />
        Falta pouco para o link do seu buffet funcionar
      </p>
      <ul className="space-y-1">
        {pendencias.map((p) => (
          <li key={p.codigo}>
            <Link href={`/app/empresa/${p.secao}`} className="underline-offset-4 hover:underline">
              {p.mensagem}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function EmpresaLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirSessao();
  const dono = usuario.perfil === 'dono';

  return (
    // a tela do Link (editor + prévia) marca data-tela-larga e ganha mais largura no PC
    <div className="mx-auto max-w-4xl has-[[data-tela-larga]]:max-w-7xl">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Minha empresa</h1>
      <Suspense fallback={<NavEmpresa secoes={secoesDe(dono)} />}>
        <NavComPendencias usuario={usuario} />
      </Suspense>
      {!dono && (
        <p className="rounded-control bg-muted text-muted-foreground mb-5 border px-3 py-2.5 text-sm">
          Você está vendo a configuração em modo leitura. Só o dono do buffet pode alterar.
        </p>
      )}
      <Suspense fallback={null}>
        <AvisoPendencias usuario={usuario} />
      </Suspense>
      {children}
    </div>
  );
}
