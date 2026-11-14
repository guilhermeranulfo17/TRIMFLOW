/*
 * Radar de uso (§92): cada tela do painel pertence a uma área. A lista é a mesma da função SQL
 * registrar_uso (o teste de integração confere): mudou uma, mude a outra.
 */

export const AREAS_USO = [
  'inicio',
  'lead',
  'tarefas',
  'agenda',
  'orcamento',
  'clientes',
  'contratos',
  'financeiro',
  'numeros',
  'empresa',
  'catalogo',
  'regras',
  'link',
  'plano',
  'usuarios',
  'avisos',
  'conta',
  'solucoes',
  'margem',
  'onboarding',
  'outra',
] as const;
export type AreaUso = (typeof AREAS_USO)[number];

export const ROTULO_AREA: Record<AreaUso, string> = {
  inicio: 'Início (funil e lista)',
  lead: 'Detalhe do lead',
  tarefas: 'Tarefas',
  agenda: 'Agenda',
  orcamento: 'Orçamento interno',
  clientes: 'Clientes',
  contratos: 'Contratos',
  financeiro: 'Financeiro',
  numeros: 'Números',
  empresa: 'Minha empresa (outras)',
  catalogo: 'Catálogo',
  regras: 'Regras e preços',
  link: 'Link, página pública e QR',
  plano: 'Plano',
  usuarios: 'Usuários',
  avisos: 'Avisos',
  conta: 'Minha conta',
  solucoes: 'Nossas soluções',
  margem: 'OrkMargem',
  onboarding: 'Onboarding',
  outra: 'Outras telas',
};

const PREFIXOS: [string, AreaUso][] = [
  ['/app/leads/', 'lead'],
  ['/app/leads', 'inicio'],
  ['/app/tarefas', 'tarefas'],
  ['/app/agenda', 'agenda'],
  ['/app/orcamentos', 'orcamento'],
  ['/app/clientes', 'clientes'],
  ['/app/contratos', 'contratos'],
  ['/app/financeiro', 'financeiro'],
  ['/app/numeros', 'numeros'],
  ['/app/empresa/catalogo', 'catalogo'],
  ['/app/empresa/regras', 'regras'],
  ['/app/empresa/link', 'link'],
  ['/app/empresa/plano', 'plano'],
  ['/app/empresa/usuarios', 'usuarios'],
  ['/app/empresa', 'empresa'],
  ['/app/avisos', 'avisos'],
  ['/app/conta', 'conta'],
  ['/app/solucoes', 'solucoes'],
  ['/app/margem', 'margem'],
  ['/app/comecar', 'onboarding'],
];

/** Área de uma rota do painel (null fora do painel). */
export function areaDaRota(caminho: string): AreaUso | null {
  const c = caminho.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
  if (c !== '/app' && !c.startsWith('/app/')) return null;
  for (const [prefixo, area] of PREFIXOS) {
    if (c === prefixo || c.startsWith(prefixo.endsWith('/') ? prefixo : `${prefixo}/`)) return area;
  }
  return 'outra';
}

export function areaValida(v: unknown): v is AreaUso {
  return typeof v === 'string' && (AREAS_USO as readonly string[]).includes(v);
}
