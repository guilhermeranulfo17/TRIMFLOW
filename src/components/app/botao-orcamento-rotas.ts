/**
 * Telas onde o "+ Orçamento" fixo aparece: só as do dia a dia comercial (Início/leads, Tarefas,
 * Agenda e Clientes). Configuração (Minha empresa, Minha conta), Nossas soluções, Números,
 * Contratos, Financeiro e OrkMargem não têm o botão. Também some dentro do lead (barra própria
 * com "Novo orçamento") e nas telas de orçamento (resumo fixo no rodapé).
 */
const COM_BOTAO = ['/app', '/app/leads', '/app/tarefas', '/app/agenda', '/app/clientes'];

export function mostraBotaoOrcamento(caminho: string): boolean {
  if (/^\/app\/leads\/[^/]+/.test(caminho)) return false;
  return COM_BOTAO.some((base) =>
    base === '/app' ? caminho === '/app' : caminho === base || caminho.startsWith(`${base}/`),
  );
}
