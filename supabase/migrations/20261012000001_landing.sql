-- Etapa 9.6 · Landing page do Orkestra (site de vendas).
-- Tudo aditivo: duas funções públicas de leitura/contagem (schema publico, só anon), uma tabela
-- agregada de visitas sem nada pessoal, a coluna empresas.origem_cadastro e a função que grava a
-- origem do cadastro (anúncio, Instagram…). O código anterior não usa nada disto.

-- ---------------------------------------------------------------------------
-- 1. Preços da vitrine: planos ativos e vagas do FUNDADOR
-- ---------------------------------------------------------------------------

/**
 * Preços e limites dos planos à venda e o cupom FUNDADOR (sem ids, sem nada interno). A landing
 * lê só daqui: anon não lê planos nem cupons. Espelho dos tipos: domain/marketing/precos-vitrine.
 */
create or replace function publico.planos_vitrine()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'planos', coalesce((select jsonb_agg(jsonb_build_object(
        'codigo', p.codigo,
        'nome', p.nome,
        'preco_mensal_centavos', p.preco_mensal_centavos,
        'preco_anual_centavos', p.preco_anual_centavos,
        'max_usuarios', p.max_usuarios,
        'max_espacos', p.max_espacos,
        'whatsapp_avisos', p.whatsapp_avisos,
        'follow_up', p.follow_up,
        'numeros_completo', p.numeros_completo) order by p.ordem, p.codigo)
      from public.planos p where p.ativo), '[]'),
    'fundador', (select jsonb_build_object(
        'plano_codigo', c.plano_codigo,
        'ciclo', c.ciclo,
        'desconto_centavos', c.desconto_centavos,
        'duracao_meses', c.duracao_meses,
        'max_usos', c.max_usos,
        'usos', c.usos,
        'valido_ate', c.valido_ate,
        'ativo', c.ativo)
      from public.cupons c where upper(c.codigo) = 'FUNDADOR'));
$$;

revoke all on function publico.planos_vitrine() from public, anon, authenticated;
grant execute on function publico.planos_vitrine() to anon;

-- ---------------------------------------------------------------------------
-- 2. Contagem agregada da landing (sem identificar ninguém)
-- ---------------------------------------------------------------------------

-- Sem empresa_id (é do Orkestra, não de um buffet): fora do _exigir_escrita, como planos.
create table public.landing_contagem (
  dia     date not null,
  evento  text not null check (evento in ('visita', 'clicou_teste')),
  total   integer not null default 0 check (total >= 0),
  primary key (dia, evento)
);

comment on table public.landing_contagem is
  'Visitas e cliques em "Testar grátis" da landing, por dia. Sem IP, cookie ou qualquer dado pessoal.';

alter table public.landing_contagem enable row level security;
revoke all on public.landing_contagem from public, anon, authenticated;
grant all on public.landing_contagem to service_role;

/** Soma 1 no evento do dia (fuso de São Paulo). Evento desconhecido é recusado. */
create or replace function publico.landing_contar(p_evento text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_evento is null or p_evento not in ('visita', 'clicou_teste') then
    raise exception 'EVENTO_INVALIDO' using errcode = 'check_violation';
  end if;
  insert into public.landing_contagem (dia, evento, total)
  values ((now() at time zone 'America/Sao_Paulo')::date, p_evento, 1)
  on conflict (dia, evento) do update set total = public.landing_contagem.total + 1;
end;
$$;

revoke all on function publico.landing_contar(text) from public, anon, authenticated;
grant execute on function publico.landing_contar(text) to anon;

-- ---------------------------------------------------------------------------
-- 3. Origem do cadastro (UTM e ref do anúncio)
-- ---------------------------------------------------------------------------

/** Só as chaves conhecidas, valores texto curtos. Espelho: domain/marketing/origem. */
create or replace function public._origem_cadastro_valida(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and octet_length(p::text) <= 1024
    and not exists (
      select 1 from jsonb_each(p) x
      where x.key not in ('utm_source', 'utm_medium', 'utm_campaign', 'ref')
         or jsonb_typeof(x.value) <> 'string'
         or char_length(x.value #>> '{}') not between 1 and 60));
$$;

alter table public.empresas add column if not exists origem_cadastro jsonb;
alter table public.empresas
  add constraint empresas_origem_cadastro_valida check (public._origem_cadastro_valida(origem_cadastro));

comment on column public.empresas.origem_cadastro is
  'De onde veio o cadastro (utm_source, utm_medium, utm_campaign, ref). Gravado uma vez.';

/**
 * Grava a origem do cadastro na empresa de quem chama, uma vez só (não sobrescreve). Chamada
 * logo depois de criar a conta (e-mail ou Google). Devolve true se gravou.
 */
create or replace function public.registrar_origem_cadastro(p_origem jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios;
  v_n integer;
begin
  if auth.uid() is null then
    raise exception 'SEM_SESSAO' using errcode = 'insufficient_privilege';
  end if;
  if p_origem is null or p_origem = '{}'::jsonb then
    return false;
  end if;
  if not public._origem_cadastro_valida(p_origem) then
    raise exception 'ORIGEM_INVALIDA' using errcode = 'check_violation';
  end if;
  select * into v_u from public.usuarios where id = auth.uid() and ativo;
  if v_u.id is null or v_u.perfil <> 'dono' then
    raise exception 'SEM_PERMISSAO' using errcode = 'insufficient_privilege';
  end if;

  update public.empresas set origem_cadastro = p_origem
  where id = v_u.empresa_id and origem_cadastro is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return false;
  end if;

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'empresa.origem_cadastro', 'empresa', v_u.empresa_id,
          jsonb_build_object('origem', p_origem));
  return true;
end;
$$;

-- _origem_cadastro_valida fica executável: o check de empresas roda com quem grava (painel).
revoke all on function public.registrar_origem_cadastro(jsonb) from public, anon;
grant execute on function public.registrar_origem_cadastro(jsonb) to authenticated;
