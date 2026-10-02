import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { NavEmpresa, type SecaoEmpresa } from '@/components/app/empresa/nav-empresa';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarPendencias } from '@/server/catalogo/pendencias';

export default async function EmpresaLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirSessao();
  const pendencias = await carregarPendencias(usuario.id);
  const contar = (secao: string) => pendencias.filter((p) => p.secao === secao).length;
  const dono = usuario.perfil === 'dono';

  const secoes: SecaoEmpresa[] = [
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
    ...(dono
      ? [
          { href: '/app/empresa/usuarios', rotulo: 'Usuários' },
          { href: '/app/empresa/plano', rotulo: 'Plano' },
          { href: '/app/empresa/simulador', rotulo: 'Simulador' },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Minha empresa</h1>
      <NavEmpresa secoes={secoes} />
      {!dono && (
        <p className="rounded-control bg-muted text-muted-foreground mb-5 border px-3 py-2.5 text-sm">
          Você está vendo a configuração em modo leitura. Só o dono do buffet pode alterar.
        </p>
      )}
      {pendencias.length > 0 && (
        <div
          role="status"
          className="rounded-card mb-5 border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        >
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <TriangleAlert className="size-4 text-amber-300" aria-hidden />
            Falta pouco para o link do seu buffet funcionar
          </p>
          <ul className="space-y-1">
            {pendencias.map((p) => (
              <li key={p.codigo}>
                <Link
                  href={`/app/empresa/${p.secao}`}
                  className="underline-offset-4 hover:underline"
                >
                  {p.mensagem}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {children}
    </div>
  );
}
