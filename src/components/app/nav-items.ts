import { BarChart3, Building2, CalendarDays, Inbox, type LucideIcon } from 'lucide-react';

export type ItemNav = { href: string; rotulo: string; icone: LucideIcon };

export const ITENS_NAV: readonly ItemNav[] = [
  { href: '/app/leads', rotulo: 'Leads', icone: Inbox },
  { href: '/app/agenda', rotulo: 'Agenda', icone: CalendarDays },
  { href: '/app/numeros', rotulo: 'Números', icone: BarChart3 },
  { href: '/app/empresa', rotulo: 'Minha empresa', icone: Building2 },
];

export function itemAtivo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
