import type { UsuarioAtual } from '@/server/auth/sessao';
import { carregarChecklist, type ChecklistDoUsuario } from '@/server/onboarding/carregar';
import { ChecklistLink } from './checklist';

/** Checklist do link no topo da caixa e em Minha empresa: some com 100% ou se dispensado. */
export async function ChecklistPainel({
  usuario,
  aberto = false,
  checklist,
}: {
  usuario: UsuarioAtual;
  aberto?: boolean;
  /** já lido pela página (na transação dela); sem ele, lê aqui */
  checklist?: ChecklistDoUsuario;
}) {
  const c = checklist ?? (await carregarChecklist(usuario));
  if (c.dispensado || c.completo) return null;
  return (
    <ChecklistLink
      percentual={c.percentual}
      itens={c.itens}
      dono={usuario.perfil === 'dono'}
      inicialAberto={aberto}
    />
  );
}
