-- Radar de uso (novembro de 2026): quantas vezes cada área do painel é aberta, por empresa e
-- por dia, para a equipe Orkestra ver no /interno o que é mais e menos usado. Só contagem
-- agregada: sem usuário, IP ou qualquer dado pessoal. Só expansão: tabela e funções novas.

create table public.uso_painel (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  dia        date not null,
  area       text not null check (area ~ '^[a-z_]{2,40}$'),
  acessos    integer not null default 0 check (acessos >= 0),
  primary key (empresa_id, dia, area)
);

comment on table public.uso_painel is
  'Radar de uso: aberturas de cada área do painel por empresa e dia (fuso da empresa). Sem dado pessoal.';

create index uso_painel_dia_idx on public.uso_painel (dia);

-- Só a equipe lê (conexão administrativa do /interno); ninguém escreve direto.
alter table public.uso_painel enable row level security;
revoke all on public.uso_painel from public, anon, authenticated;
grant all on public.uso_painel to service_role;

-- Demo nunca grava (como as outras tabelas). Fora do _exigir_escrita de propósito, como
-- funil_eventos: a contagem segue com a conta suspensa (o que o buffet abre nessa hora importa).
drop trigger if exists uso_painel_nao_demo on public.uso_painel;
create trigger uso_painel_nao_demo before insert or update or delete on public.uso_painel
  for each row execute function public._exigir_nao_demo();

/**
 * Soma 1 na área do dia para a empresa de quem está logado. Área fora da lista é ignorada;
 * conta de demonstração e de apresentação não contam (não são uso de cliente).
 */
create or replace function public.registrar_uso(p_area text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_e public.empresas;
begin
  if v_empresa is null or p_area is null or p_area not in (
    'inicio', 'lead', 'tarefas', 'agenda', 'orcamento', 'clientes', 'contratos', 'financeiro',
    'numeros', 'empresa', 'catalogo', 'regras', 'link', 'plano', 'usuarios',
    'avisos', 'conta', 'solucoes', 'margem', 'onboarding', 'outra') then
    return;
  end if;
  select * into v_e from public.empresas e where e.id = v_empresa;
  if v_e.id is null or v_e.eh_demo or v_e.eh_apresentacao then
    return;
  end if;
  insert into public.uso_painel (empresa_id, dia, area, acessos)
  values (v_empresa, (now() at time zone v_e.fuso)::date, p_area, 1)
  on conflict (empresa_id, dia, area) do update set acessos = public.uso_painel.acessos + 1;
end;
$$;

revoke all on function public.registrar_uso(text) from public, anon;
grant execute on function public.registrar_uso(text) to authenticated;
