-- Etapa 11 · Financeiro da festa: plano de pagamento (sinal e parcelas) e recebimentos de cada
-- reserva confirmada. Tudo aditivo: tabelas e funções novas; nada do código anterior muda.
--
-- Regras (docs/ARQUITETURA.md §72):
--  * Só o dono lê e escreve (o vendedor não vê valores recebidos).
--  * Escrita só por funções (plano, recebimento, estorno), com auditoria e a trava de conta
--    suspensa e da demo (_exigir_escrita).
--  * Recebimento nunca é apagado: erro se corrige com estorno (fica no histórico).
--  * A situação (pago, atrasado, a receber) é calculada no servidor (domain/financeiro) a partir
--    do plano e dos recebimentos; o banco só guarda os fatos.

create table public.reserva_parcelas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  reserva_id     uuid not null,
  numero         smallint not null check (numero between 1 and 24),
  descricao      text not null check (char_length(btrim(descricao)) between 1 and 80),
  valor_centavos integer not null check (valor_centavos > 0),
  vence_em       date not null,
  criado_em      timestamptz not null default now(),
  unique (reserva_id, numero),
  foreign key (reserva_id, empresa_id) references public.reservas (id, empresa_id) on delete cascade
);
create index reserva_parcelas_empresa_idx on public.reserva_parcelas (empresa_id, vence_em);

comment on table public.reserva_parcelas is
  'Plano de pagamento da festa (sinal e parcelas). Trocado inteiro por salvar_plano_pagamento.';

create table public.recebimentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  reserva_id     uuid not null,
  valor_centavos integer not null check (valor_centavos > 0),
  recebido_em    date not null,
  forma          text not null check (forma in ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito',
                                                'boleto', 'transferencia', 'outro')),
  observacao     text check (observacao is null or char_length(observacao) <= 200),
  criado_por     uuid references public.usuarios (id) on delete set null,
  criado_em      timestamptz not null default now(),
  estornado_em   timestamptz,
  estornado_por  uuid references public.usuarios (id) on delete set null,
  estorno_motivo text check (estorno_motivo is null or char_length(estorno_motivo) <= 200),
  foreign key (reserva_id, empresa_id) references public.reservas (id, empresa_id) on delete cascade
);
create index recebimentos_reserva_idx on public.recebimentos (reserva_id, empresa_id);
create index recebimentos_empresa_idx on public.recebimentos (empresa_id, recebido_em);
create index recebimentos_criado_por_idx on public.recebimentos (criado_por);
create index recebimentos_estornado_por_idx on public.recebimentos (estornado_por);

comment on table public.recebimentos is
  'Dinheiro recebido do cliente por festa. Nunca apagado: o erro vira estorno.';

do $$
declare
  t text;
begin
  foreach t in array array['reserva_parcelas', 'recebimentos'] loop
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

/** Recebimento: só o estorno muda a linha (uma vez); apagar, nunca com sessão de usuário. */
create or replace function public._recebimento_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null then
      raise exception 'RECEBIMENTO_IMUTAVEL' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  -- usuário apagado (exclusão da conta): só os autores viram null
  if (to_jsonb(new) - 'criado_por' - 'estornado_por') = (to_jsonb(old) - 'criado_por' - 'estornado_por')
     and (new.criado_por is null or new.criado_por = old.criado_por)
     and (new.estornado_por is null or new.estornado_por = old.estornado_por) then
    return new;
  end if;
  if old.estornado_em is not null
     or new.valor_centavos <> old.valor_centavos or new.recebido_em <> old.recebido_em
     or new.forma <> old.forma or new.observacao is distinct from old.observacao
     or new.reserva_id <> old.reserva_id or new.empresa_id <> old.empresa_id
     or new.estornado_em is null then
    raise exception 'RECEBIMENTO_IMUTAVEL' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger recebimentos_imutavel before update or delete on public.recebimentos
  for each row execute function public._recebimento_imutavel();

/** Dono ativo da sessão (o financeiro é só do dono). */
create or replace function public._financeiro_dono()
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
    raise exception 'FINANCEIRO_SO_DONO' using errcode = 'insufficient_privilege';
  end if;
  return v;
end;
$$;

/** Reserva confirmada (ativa ou realizada) da empresa, travada. */
create or replace function public._financeiro_reserva(p_empresa uuid, p_reserva uuid)
returns public.reservas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.reservas;
begin
  select * into v from public.reservas r
  where r.id = p_reserva and r.empresa_id = p_empresa
  for update;
  if v.id is null then
    raise exception 'FINANCEIRO_RESERVA_NAO_ENCONTRADA' using errcode = 'no_data_found';
  end if;
  if v.tipo <> 'confirmada' or v.status not in ('ativa', 'realizada') then
    raise exception 'FINANCEIRO_RESERVA_NAO_CONFIRMADA' using errcode = 'check_violation';
  end if;
  return v;
end;
$$;

/**
 * Troca o plano de pagamento da reserva: p = [{descricao, valor_centavos, vence_em}] (1 a 24).
 * A soma vira o valor total da reserva (o dono confere na tela). Na primeira vez, o sinal já
 * marcado como pago na Agenda entra como recebimento, para não ficar "devendo" o que já entrou.
 */
create or replace function public.salvar_plano_pagamento(p_reserva uuid, p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u     public.usuarios := public._financeiro_dono();
  v_r     public.reservas;
  v_item  jsonb;
  v_n     integer := 0;
  v_total bigint := 0;
  v_antes jsonb;
begin
  v_r := public._financeiro_reserva(v_u.empresa_id, p_reserva);
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 24 then
    raise exception 'FINANCEIRO_PLANO_INVALIDO' using errcode = 'check_violation';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) - 'id' - 'empresa_id' - 'reserva_id' - 'criado_em'
                            order by x.numero), '[]'::jsonb)
  into v_antes from public.reserva_parcelas x where x.reserva_id = p_reserva;

  -- primeira vez: o sinal pago na Agenda vira recebimento
  if not exists (select 1 from public.reserva_parcelas x where x.reserva_id = p_reserva)
     and not exists (select 1 from public.recebimentos x where x.reserva_id = p_reserva)
     and v_r.sinal_pago_em is not null and coalesce(v_r.sinal_centavos, 0) > 0 then
    insert into public.recebimentos (empresa_id, reserva_id, valor_centavos, recebido_em, forma,
      observacao, criado_por)
    values (v_u.empresa_id, p_reserva, v_r.sinal_centavos, v_r.sinal_pago_em, 'outro',
      'Sinal marcado como pago na Agenda', v_u.id);
  end if;

  delete from public.reserva_parcelas x where x.reserva_id = p_reserva;
  for v_item in select * from jsonb_array_elements(p) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_item) <> 'object'
       or coalesce((v_item ->> 'valor_centavos')::bigint, 0) <= 0
       or (v_item ->> 'valor_centavos')::bigint > 100000000
       or nullif(btrim(coalesce(v_item ->> 'descricao', '')), '') is null
       or (v_item ->> 'vence_em') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'FINANCEIRO_PLANO_INVALIDO' using errcode = 'check_violation';
    end if;
    insert into public.reserva_parcelas (empresa_id, reserva_id, numero, descricao, valor_centavos, vence_em)
    values (v_u.empresa_id, p_reserva, v_n, left(btrim(v_item ->> 'descricao'), 80),
      (v_item ->> 'valor_centavos')::integer, (v_item ->> 'vence_em')::date);
    v_total := v_total + (v_item ->> 'valor_centavos')::bigint;
  end loop;
  if v_total > 2000000000 then
    raise exception 'FINANCEIRO_PLANO_INVALIDO' using errcode = 'check_violation';
  end if;

  update public.reservas set valor_total_centavos = v_total::integer
  where id = p_reserva and valor_total_centavos is distinct from v_total::integer;

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'financeiro.plano', 'reserva', p_reserva,
    jsonb_build_object('antes', v_antes, 'depois', p, 'total_antes', v_r.valor_total_centavos,
                       'total', v_total));
  return v_n;
end;
$$;

/** Registra um recebimento (data no passado ou hoje, no fuso da empresa). Devolve o id. */
create or replace function public.registrar_recebimento(
  p_reserva uuid, p_valor_centavos integer, p_recebido_em date, p_forma text, p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u    public.usuarios := public._financeiro_dono();
  v_r    public.reservas;
  v_hoje date;
  v_id   uuid;
begin
  v_r := public._financeiro_reserva(v_u.empresa_id, p_reserva);
  select (now() at time zone e.fuso)::date into v_hoje from public.empresas e where e.id = v_u.empresa_id;
  if coalesce(p_valor_centavos, 0) <= 0 or p_valor_centavos > 100000000
     or p_recebido_em is null or p_recebido_em > v_hoje or p_recebido_em < v_hoje - 3650
     or p_forma is null
     or p_forma not in ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto',
                        'transferencia', 'outro') then
    raise exception 'FINANCEIRO_RECEBIMENTO_INVALIDO' using errcode = 'check_violation';
  end if;
  insert into public.recebimentos (empresa_id, reserva_id, valor_centavos, recebido_em, forma,
    observacao, criado_por)
  values (v_u.empresa_id, p_reserva, p_valor_centavos, p_recebido_em, p_forma,
    left(nullif(btrim(coalesce(p_observacao, '')), ''), 200), v_u.id)
  returning id into v_id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'financeiro.recebimento', 'reserva', p_reserva,
    jsonb_build_object('recebimento_id', v_id, 'valor_centavos', p_valor_centavos,
                       'recebido_em', p_recebido_em, 'forma', p_forma));
  return v_id;
end;
$$;

/** Estorna um recebimento lançado errado (fica no histórico, riscado). */
create or replace function public.estornar_recebimento(p_id uuid, p_motivo text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u   public.usuarios := public._financeiro_dono();
  v_rec public.recebimentos;
begin
  select * into v_rec from public.recebimentos x
  where x.id = p_id and x.empresa_id = v_u.empresa_id for update;
  if v_rec.id is null then
    raise exception 'FINANCEIRO_RECEBIMENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  if v_rec.estornado_em is not null then
    return false;
  end if;
  update public.recebimentos set estornado_em = now(), estornado_por = v_u.id,
    estorno_motivo = left(nullif(btrim(coalesce(p_motivo, '')), ''), 200)
  where id = p_id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'financeiro.estorno', 'reserva', v_rec.reserva_id,
    jsonb_build_object('recebimento_id', p_id, 'valor_centavos', v_rec.valor_centavos,
                       'motivo', p_motivo));
  return true;
end;
$$;

revoke all on function public._recebimento_imutavel() from public, anon, authenticated;
revoke all on function public._financeiro_dono() from public, anon, authenticated;
revoke all on function public._financeiro_reserva(uuid, uuid) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.salvar_plano_pagamento(uuid, jsonb)',
    'public.registrar_recebimento(uuid, integer, date, text, text)',
    'public.estornar_recebimento(uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
