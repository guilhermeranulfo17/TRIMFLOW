import { FlaskConical } from 'lucide-react';

/** Dono logado testando o próprio link (decidido pela sessão no servidor). */
export function BannerTeste() {
  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900"
    >
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      Modo teste: nada aqui conta nas métricas
    </div>
  );
}
