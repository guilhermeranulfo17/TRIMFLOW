-- OrkMargem: custos variáveis e margem de contribuição por festa (módulo adicional).
--
-- Regras (docs/ARQUITETURA.md §78):
--  * Só o dono lê e escreve (valores e custos). Leitura vale sempre (histórico, inclusive depois
--    de cancelar o módulo); escrita só com o módulo vigente (_exigir_modulo → MODULO_INATIVO).
--  * Escrita só por funções, com auditoria e a trava de conta suspensa e da demo (_exigir_escrita).
--  * Reaproveita pacotes e reservas: nenhum cadastro paralelo de festas.
--  * Margem de contribuição = receita contratada − custos variáveis (calculada no servidor em
--    domain/modulos/margem; o banco só guarda os fatos).

create table public.margem_custos_pacote (
  id                       uuid primary key default gen_random_uuid(),
  empresa_id               uuid not null references public.empresas (id) on delete cascade,
  pacote_id                uuid not null,
  categoria                text not null check (categoria in ('alimentacao', 'bebidas', 'equipe',
                             'decoracao', 'terceiros', 'descartaveis', 'taxas', 'outros')),
  fixo_centavos            integer not null default 0 check (fixo_centavos between 0 and 100000000),
  por_convidado_centavos   integer not null default 0 check (por_convidado_centavos between 0 and 10000000),
  atualizado_em            timestamptz not null default now(),
  unique (pacote_id, categoria),
  foreign key (pacote_id, empresa_id) references public.pacotes (id, empresa_id) on delete cascade
);
create index margem_custos_pacote_empresa_idx on public.margem_custos_pacote (empresa_id);
create index margem_custos_pacote_pacote_idx on public.margem_custos_pacote (pacote_id, empresa_id);

comment on table public.margem_custos_pacote is
  'OrkMargem: custo previsto de cada pacote por categoria (fixo por festa + por convidado).';

create table public.margem_festas (
  reserva_id      uuid primary key,
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  -- foto do pacote na preparação (o nome agrupa a comparação; o pacote pode mudar depois)
  pacote_id       uuid,
  pacote_nome     text check (pacote_nome is null or char_length(pacote_nome) <= 80),
  convidados      integer check (convidados is null or convidados between 1 and 100000),
  preparada_em    timestamptz not null default now(),
  preparada_por   uuid references public.usuarios (id) on delete set null,
  fechada_em      timestamptz,
  fechada_por     uuid references public.usuarios (id) on delete set null,
  unique (reserva_id, empresa_id),
  foreign key (reserva_id, empresa_id) references public.reservas (id, empresa_id) on delete cascade
);
create index margem_festas_empresa_idx on public.margem_festas (empresa_id);
create index margem_festas_preparada_por_idx on public.margem_festas (preparada_por);
create index margem_festas_fechada_por_idx on public.margem_festas (fechada_por);

comment on table public.margem_festas is
  'OrkMargem: a festa preparada (previsão copiada), com fechamento. Reabrir exige motivo (auditoria).';

create table public.margem_custos_festa (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas (id) on delete cascade,
  reserva_id          uuid not null,
  ordem               smallint not null default 0 check (ordem between 0 and 99),
  categoria           text not null check (categoria in ('alimentacao', 'bebidas', 'equipe',
                        'decoracao', 'terceiros', 'descartaveis', 'taxas', 'outros')),
  descricao           text not null check (char_length(btrim(descricao)) between 1 and 80),
  previsto_centavos   integer not null check (previsto_centavos between 0 and 100000000),
  realizado_centavos  integer check (realizado_centavos is null or realizado_centavos between 0 and 100000000),
  foreign key (reserva_id, empresa_id) references public.margem_festas (reserva_id, empresa_id) on delete cascade
);
create index margem_custos_festa_reserva_idx on public.margem_custos_festa (reserva_id, empresa_id, ordem);
create index margem_custos_festa_empresa_idx on public.margem_custos_festa (empresa_id);

do $$
declare
  t text;
begin
  foreach t in array array['margem_custos_pacote', 'margem_festas', 'margem_custos_festa'] loop
    execute format('create trigger %I before insert or update or delete on public.%I '
                   'for each row execute function public._exigir_escrita()', t || '_somente_leitura', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (empresa_id = (select public.empresa_do_usuario())
                and (select public.perfil_do_usuario()) = ''dono'')',
      t || '_select_dono', t);
  end loop;
end;
$$;

create trigger margem_custos_pacote_atualizado_em
  before update on public.margem_custos_pacote
  for each row execute function public.tocar_atualizado_em();

/** Dono da sessão com o OrkMargem vigente. */
create or replace function public._margem_dono()
returns public.usuarios
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.usuarios;
begin
  select * into v from public.usuarios u where u.id = auth.uid() and u.ativo;
  if v.id is null or v.perfil <> 'dono' then
    raise exception 'MARGEM_SO_DONO' using errcode = 'insufficient_privilege';
  end if;
  perform public._exigir_modulo(v.empresa_id, 'orkmargem');
  return v;
end;
$$;

/** Festa preparada e aberta (travada); fechada não muda sem reabrir. */
create or replace function public._margem_festa_aberta(p_empresa uuid, p_reserva uuid)
returns public.margem_festas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.margem_festas;
begin
  select * into v from public.margem_festas f
  where f.reserva_id = p_reserva and f.empresa_id = p_empresa for update;
  if v.reserva_id is null then
    raise exception 'MARGEM_FESTA_NAO_PREPARADA' using errcode = 'no_data_found';
  end if;
  if v.fechada_em is not null then
    raise exception 'MARGEM_FESTA_FECHADA' using errcode = 'check_violation';
  end if;
  return v;
end;
$$;

/**
 * Previsão de custos de um pacote: p = [{categoria, fixo_centavos, por_convidado_centavos}].
 * Troca a previsão inteira do pacote (categoria sem valor some).
 */
create or replace function public.margem_salvar_custos_pacote(p_pacote uuid, p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u    public.usuarios := public._margem_dono();
  v_item jsonb;
  v_n    integer := 0;
begin
  if not exists (select 1 from public.pacotes pc where pc.id = p_pacote and pc.empresa_id = v_u.empresa_id) then
    raise exception 'MARGEM_PACOTE_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 8 then
    raise exception 'MARGEM_DADOS_INVALIDOS' using errcode = 'check_violation';
  end if;
  delete from public.margem_custos_pacote c where c.pacote_id = p_pacote and c.empresa_id = v_u.empresa_id;
  for v_item in select * from jsonb_array_elements(p) loop
    if coalesce((v_item ->> 'fixo_centavos')::integer, 0) > 0
       or coalesce((v_item ->> 'por_convidado_centavos')::integer, 0) > 0 then
      insert into public.margem_custos_pacote (empresa_id, pacote_id, categoria, fixo_centavos, por_convidado_centavos)
      values (v_u.empresa_id, p_pacote, v_item ->> 'categoria',
              coalesce((v_item ->> 'fixo_centavos')::integer, 0),
              coalesce((v_item ->> 'por_convidado_centavos')::integer, 0));
      v_n := v_n + 1;
    end if;
  end loop;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'margem.custos_pacote', 'pacote', p_pacote, jsonb_build_object('custos', p));
  return v_n;
end;
$$;

/**
 * Prepara a festa: copia a previsão do pacote para os convidados da reserva. O pacote vem do
 * orçamento da reserva (ou de p_pacote). p_substituir refaz a cópia, só sem custo realizado.
 */
create or replace function public.margem_preparar_festa(
  p_reserva uuid, p_pacote uuid default null, p_substituir boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u      public.usuarios := public._margem_dono();
  v_r      public.reservas := public._financeiro_reserva(v_u.empresa_id, p_reserva);
  v_pacote uuid := p_pacote;
  v_nome   text;
  v_conv   integer;
  v_atual  public.margem_festas;
  v_n      integer := 0;
begin
  select * into v_atual from public.margem_festas f
  where f.reserva_id = v_r.id and f.empresa_id = v_u.empresa_id for update;
  if v_atual.reserva_id is not null then
    if not p_substituir then
      raise exception 'MARGEM_JA_PREPARADA' using errcode = 'unique_violation';
    end if;
    if v_atual.fechada_em is not null then
      raise exception 'MARGEM_FESTA_FECHADA' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.margem_custos_festa c
               where c.reserva_id = v_r.id and c.realizado_centavos is not null) then
      raise exception 'MARGEM_COM_REALIZADO' using errcode = 'check_violation';
    end if;
  end if;

  if v_pacote is null and v_r.orcamento_id is not null then
    select (l ->> 'referenciaId')::uuid into v_pacote
    from public.orcamentos o, jsonb_array_elements(coalesce(o.resultado -> 'linhas', '[]'::jsonb)) l
    where o.id = v_r.orcamento_id and o.empresa_id = v_u.empresa_id and l ->> 'tipo' = 'pacote'
      and l ->> 'referenciaId' ~ '^[0-9a-f-]{36}$'
    limit 1;
  end if;
  if v_pacote is not null then
    select pc.nome into v_nome from public.pacotes pc where pc.id = v_pacote and pc.empresa_id = v_u.empresa_id;
    if v_nome is null then
      raise exception 'MARGEM_PACOTE_NAO_ENCONTRADO' using errcode = 'no_data_found';
    end if;
  end if;
  v_conv := v_r.convidados;

  if v_atual.reserva_id is null then
    insert into public.margem_festas (reserva_id, empresa_id, pacote_id, pacote_nome, convidados, preparada_por)
    values (v_r.id, v_u.empresa_id, v_pacote, v_nome, v_conv, v_u.id);
  else
    delete from public.margem_custos_festa c where c.reserva_id = v_r.id and c.empresa_id = v_u.empresa_id;
    update public.margem_festas set pacote_id = v_pacote, pacote_nome = v_nome, convidados = v_conv,
      preparada_em = now(), preparada_por = v_u.id
    where reserva_id = v_r.id;
  end if;

  if v_pacote is not null then
    insert into public.margem_custos_festa (empresa_id, reserva_id, ordem, categoria, descricao, previsto_centavos)
    select v_u.empresa_id, v_r.id, row_number() over (order by array_position(
             array['alimentacao', 'bebidas', 'equipe', 'decoracao', 'terceiros', 'descartaveis', 'taxas', 'outros'],
             c.categoria)) - 1,
           c.categoria,
           case c.categoria when 'alimentacao' then 'Alimentação' when 'bebidas' then 'Bebidas'
             when 'equipe' then 'Equipe' when 'decoracao' then 'Decoração' when 'terceiros' then 'Terceiros'
             when 'descartaveis' then 'Descartáveis' when 'taxas' then 'Taxas' else 'Outros custos variáveis' end,
           c.fixo_centavos + c.por_convidado_centavos * coalesce(v_conv, 0)
    from public.margem_custos_pacote c
    where c.pacote_id = v_pacote and c.empresa_id = v_u.empresa_id
      and c.fixo_centavos + c.por_convidado_centavos * coalesce(v_conv, 0) > 0;
    get diagnostics v_n = row_count;
  end if;

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'margem.preparar', 'reserva', v_r.id,
          jsonb_build_object('pacote_id', v_pacote, 'convidados', v_conv, 'itens', v_n,
                             'substituiu', v_atual.reserva_id is not null));
  return v_n;
end;
$$;

/**
 * Custos da festa: p = [{categoria, descricao, previsto_centavos, realizado_centavos|null}]
 * (até 40). Troca a lista inteira; festa fechada não muda.
 */
create or replace function public.margem_salvar_custos_festa(p_reserva uuid, p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u     public.usuarios := public._margem_dono();
  v_f     public.margem_festas := public._margem_festa_aberta(v_u.empresa_id, p_reserva);
  v_item  jsonb;
  v_ordem integer := 0;
  v_antes jsonb;
begin
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 40 then
    raise exception 'MARGEM_DADOS_INVALIDOS' using errcode = 'check_violation';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('categoria', c.categoria, 'descricao', c.descricao,
           'previsto_centavos', c.previsto_centavos, 'realizado_centavos', c.realizado_centavos) order by c.ordem), '[]')
  into v_antes from public.margem_custos_festa c where c.reserva_id = v_f.reserva_id;
  delete from public.margem_custos_festa c where c.reserva_id = v_f.reserva_id and c.empresa_id = v_u.empresa_id;
  for v_item in select * from jsonb_array_elements(p) loop
    insert into public.margem_custos_festa (empresa_id, reserva_id, ordem, categoria, descricao,
      previsto_centavos, realizado_centavos)
    values (v_u.empresa_id, v_f.reserva_id, v_ordem, v_item ->> 'categoria', btrim(v_item ->> 'descricao'),
            coalesce((v_item ->> 'previsto_centavos')::integer, 0),
            (v_item ->> 'realizado_centavos')::integer);
    v_ordem := v_ordem + 1;
  end loop;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'margem.custos_festa', 'reserva', v_f.reserva_id,
          jsonb_build_object('antes', v_antes, 'depois', p));
  return v_ordem;
end;
$$;

/** Fecha a festa: todos os custos com valor realizado; depois disso, só reabrindo com motivo. */
create or replace function public.margem_fechar_festa(p_reserva uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._margem_dono();
  v_f public.margem_festas := public._margem_festa_aberta(v_u.empresa_id, p_reserva);
begin
  if exists (select 1 from public.margem_custos_festa c
             where c.reserva_id = v_f.reserva_id and c.realizado_centavos is null) then
    raise exception 'MARGEM_CUSTOS_PENDENTES' using errcode = 'check_violation';
  end if;
  update public.margem_festas set fechada_em = now(), fechada_por = v_u.id where reserva_id = v_f.reserva_id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'margem.fechar', 'reserva', v_f.reserva_id, '{}'::jsonb);
end;
$$;

/** Reabre a festa fechada, com motivo (fica na auditoria). */
create or replace function public.margem_reabrir_festa(p_reserva uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._margem_dono();
  v_f public.margem_festas;
begin
  if p_motivo is null or char_length(btrim(p_motivo)) not between 3 and 200 then
    raise exception 'MARGEM_MOTIVO_OBRIGATORIO' using errcode = 'check_violation';
  end if;
  select * into v_f from public.margem_festas f
  where f.reserva_id = p_reserva and f.empresa_id = v_u.empresa_id for update;
  if v_f.reserva_id is null or v_f.fechada_em is null then
    raise exception 'MARGEM_FESTA_NAO_FECHADA' using errcode = 'check_violation';
  end if;
  update public.margem_festas set fechada_em = null, fechada_por = null where reserva_id = v_f.reserva_id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'margem.reabrir', 'reserva', v_f.reserva_id,
          jsonb_build_object('motivo', btrim(p_motivo), 'fechada_em', v_f.fechada_em));
end;
$$;

revoke all on function public._margem_dono() from public, anon, authenticated;
revoke all on function public._margem_festa_aberta(uuid, uuid) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.margem_salvar_custos_pacote(uuid, jsonb)',
    'public.margem_preparar_festa(uuid, uuid, boolean)',
    'public.margem_salvar_custos_festa(uuid, jsonb)',
    'public.margem_fechar_festa(uuid)',
    'public.margem_reabrir_festa(uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
