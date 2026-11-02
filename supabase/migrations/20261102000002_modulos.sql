-- Nossas soluções: módulos adicionais contratados à parte da assinatura-base.
--
-- Tudo aditivo. Regras (docs/ARQUITETURA.md §78):
--  * Catálogo em public.modulos (preço em centavos, mensal ou por evento). Venda pública só com
--    venda_liberada = true: começa false em todos; liberar é decisão do dono do produto (nova
--    migration), depois de definidas as condições comerciais de cada módulo.
--  * A assinatura de um módulo é uma assinatura PRÓPRIA no Asaas (nunca altera a assinatura-base)
--    e as cobranças dela ficam em modulo_cobrancas, separadas de public.cobrancas: atraso num
--    adicional não mexe na situação da conta (_atualizar_situacao não olha estas tabelas).
--  * Compra por evento (OrkPass) pertence à empresa E à reserva (modulo_compras): libera só
--    aquela festa.
--  * O direito de acesso é calculado no banco (_modulo_situacao = domain/modulos/situacao, teste
--    de equivalência) a partir de cobranças confirmadas pelo provedor (webhook autenticado ou
--    leitura da API). Voltar do checkout não libera nada.
--  * O dono lê; escrita só pela conexão administrativa (server/modulos/fluxos) e pelas funções.

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
create table public.modulos (
  codigo              text primary key
                      check (codigo in ('orkflow', 'orkmargem', 'orkstage', 'orkpass', 'orkpay', 'orkbis')),
  nome                text not null check (char_length(btrim(nome)) between 2 and 40),
  cobranca            text not null check (cobranca in ('mensal', 'por_evento')),
  preco_centavos      integer not null check (preco_centavos > 0),
  -- só com true aparece "Contratar" (e o servidor aceita contratar)
  venda_liberada      boolean not null default false,
  -- dias de tolerância depois de um vencimento sem pagamento, com o acesso mantido (mensal)
  carencia_dias       smallint not null default 0 check (carencia_dias between 0 and 30),
  -- por evento: dias de acesso depois da data da festa (null = política não definida)
  acesso_evento_dias  smallint check (acesso_evento_dias is null or acesso_evento_dias between 1 and 365),
  ordem               smallint not null default 0,
  atualizado_em       timestamptz not null default now()
);

comment on table public.modulos is
  'Módulos adicionais (Nossas soluções). Preço à parte da assinatura-base. Editáveis só por migration ou /interno.';

insert into public.modulos (codigo, nome, cobranca, preco_centavos, ordem) values
  ('orkflow', 'OrkFlow', 'mensal', 14900, 1),
  ('orkmargem', 'OrkMargem', 'mensal', 14900, 2),
  ('orkstage', 'OrkStage', 'mensal', 9900, 3),
  ('orkpass', 'OrkPass', 'por_evento', 2900, 4),
  ('orkpay', 'OrkPay', 'mensal', 9900, 5),
  ('orkbis', 'OrkBis', 'mensal', 7900, 6)
on conflict (codigo) do nothing;

create trigger modulos_atualizado_em
  before update on public.modulos
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- Assinatura mensal de um módulo (uma assinatura do Asaas por módulo)
-- ---------------------------------------------------------------------------
create table public.modulo_assinaturas (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas (id) on delete cascade,
  modulo               text not null references public.modulos (codigo),
  asaas_assinatura_id  text unique,
  status               text not null default 'pendente' check (status in ('pendente', 'ativa', 'cancelada')),
  valor_centavos       integer not null check (valor_centavos > 0),
  pago_ate             date,
  atrasada_desde       date,
  criada_por           uuid references public.usuarios (id) on delete set null,
  criada_em            timestamptz not null default now(),
  cancelada_em         timestamptz,
  cancelada_por        uuid references public.usuarios (id) on delete set null,
  unique (id, empresa_id)
);
-- no máximo uma assinatura em andamento por empresa e módulo
create unique index modulo_assinaturas_uma_viva_idx
  on public.modulo_assinaturas (empresa_id, modulo) where status <> 'cancelada';
create index modulo_assinaturas_empresa_idx on public.modulo_assinaturas (empresa_id, modulo, criada_em desc);
create index modulo_assinaturas_modulo_idx on public.modulo_assinaturas (modulo);
create index modulo_assinaturas_criada_por_idx on public.modulo_assinaturas (criada_por);
create index modulo_assinaturas_cancelada_por_idx on public.modulo_assinaturas (cancelada_por);

-- ---------------------------------------------------------------------------
-- Compra por evento (OrkPass): da empresa e de UMA reserva
-- ---------------------------------------------------------------------------
create table public.modulo_compras (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  modulo          text not null references public.modulos (codigo),
  reserva_id      uuid not null,
  status          text not null default 'pendente'
                  check (status in ('pendente', 'paga', 'cancelada', 'estornada')),
  valor_centavos  integer not null check (valor_centavos > 0),
  acesso_ate      date,
  criada_por      uuid references public.usuarios (id) on delete set null,
  criada_em       timestamptz not null default now(),
  unique (id, empresa_id),
  foreign key (reserva_id, empresa_id) references public.reservas (id, empresa_id) on delete cascade
);
create unique index modulo_compras_uma_viva_idx
  on public.modulo_compras (empresa_id, modulo, reserva_id) where status in ('pendente', 'paga');
create index modulo_compras_reserva_idx on public.modulo_compras (reserva_id, empresa_id);
create index modulo_compras_modulo_idx on public.modulo_compras (modulo);
create index modulo_compras_criada_por_idx on public.modulo_compras (criada_por);

-- ---------------------------------------------------------------------------
-- Cobranças dos módulos (de uma assinatura de módulo OU de uma compra por evento)
-- ---------------------------------------------------------------------------
create table public.modulo_cobrancas (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references public.empresas (id) on delete cascade,
  modulo_assinatura_id   uuid,
  modulo_compra_id       uuid,
  asaas_cobranca_id      text not null unique,
  valor_centavos         integer not null check (valor_centavos >= 0),
  vencimento             date not null,
  status                 text not null
                         check (status in ('pendente', 'vencida', 'confirmada', 'recebida', 'estornada', 'cancelada')),
  forma                  text,
  link_fatura            text,
  pago_em                timestamptz,
  criado_em              timestamptz not null default now(),
  check (num_nonnulls(modulo_assinatura_id, modulo_compra_id) = 1),
  foreign key (modulo_assinatura_id, empresa_id)
    references public.modulo_assinaturas (id, empresa_id) on delete cascade,
  foreign key (modulo_compra_id, empresa_id)
    references public.modulo_compras (id, empresa_id) on delete cascade
);
create index modulo_cobrancas_assinatura_idx on public.modulo_cobrancas (modulo_assinatura_id, empresa_id);
create index modulo_cobrancas_compra_idx on public.modulo_cobrancas (modulo_compra_id, empresa_id);
create index modulo_cobrancas_empresa_idx on public.modulo_cobrancas (empresa_id, vencimento);

-- RLS: o catálogo é de todos os usuários logados; o resto, só o dono lê. Ninguém escreve pela API.
alter table public.modulos enable row level security;
revoke all on public.modulos from public, anon, authenticated;
grant all on public.modulos to service_role;
grant select on public.modulos to authenticated;
create policy modulos_select_todos on public.modulos for select to authenticated using (true);

do $$
declare
  t text;
begin
  foreach t in array array['modulo_assinaturas', 'modulo_compras', 'modulo_cobrancas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (empresa_id = (select public.empresa_do_usuario())
                and (select public.perfil_do_usuario()) = ''dono'')',
      t || '_select_dono', t);
    -- como assinaturas e cobrancas da base: a cobrança segue com a conta suspensa (o pagamento
    -- é o que reativa); na demo, nada com sessão de usuário
    execute format('create trigger %I before insert or update or delete on public.%I '
                   'for each row execute function public._exigir_nao_demo()', t || '_nao_demo', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Situação do direito (ESPELHO de domain/modulos/situacao, teste de equivalência)
-- ---------------------------------------------------------------------------

/**
 * Situação de uma assinatura de módulo num dia:
 *   pago_ate cobre hoje            → ativo (ou cancelamento_agendado, se cancelada)
 *   cobrança estornada sem cobertura → estornado
 *   cancelada, já tinha sido paga   → expirado; cancelada sem nunca pagar → nao_contratado
 *   pendente (nunca paga)           → pagamento_pendente
 *   ativa com o período vencido     → falha_pagamento
 */
create or replace function public._modulo_situacao(
  p_status text, p_pago_ate date, p_estornada boolean, p_hoje date
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_pago_ate is not null and p_hoje <= p_pago_ate then
      case when p_status = 'cancelada' then 'cancelamento_agendado' else 'ativo' end
    when coalesce(p_estornada, false) then 'estornado'
    when p_status = 'cancelada' then
      case when p_pago_ate is null then 'nao_contratado' else 'expirado' end
    when p_status = 'pendente' then 'pagamento_pendente'
    else 'falha_pagamento'
  end;
$$;

/** Falha de pagamento ainda dentro da carência do módulo (o acesso continua). */
create or replace function public._modulo_na_carencia(
  p_situacao text, p_pago_ate date, p_atrasada_desde date, p_carencia smallint, p_hoje date
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_situacao = 'falha_pagamento' and coalesce(p_carencia, 0) > 0
     and p_hoje <= coalesce(p_atrasada_desde, p_pago_ate + 1, p_hoje) + coalesce(p_carencia, 0);
$$;

/** Assinatura que decide o direito: a viva (não cancelada) ou, sem ela, a cancelada mais recente. */
create or replace function public._modulo_assinatura_referencia(p_empresa uuid, p_modulo text)
returns public.modulo_assinaturas
language sql
stable
security definer
set search_path = ''
as $$
  select a.* from public.modulo_assinaturas a
  where a.empresa_id = p_empresa and a.modulo = p_modulo
  order by (a.status <> 'cancelada') desc, a.criada_em desc
  limit 1;
$$;

create or replace function public._hoje_da_empresa(p_empresa uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce((select e.fuso from public.empresas e where e.id = p_empresa),
                                     'America/Sao_Paulo'))::date;
$$;

/**
 * O módulo libera as operações para a empresa (e, no por evento, para a reserva)? Usado pelas
 * funções de escrita de cada módulo e pelos guards do servidor.
 */
create or replace function public.modulo_acesso(p_empresa uuid, p_modulo text, p_reserva uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m    public.modulos;
  v_a    public.modulo_assinaturas;
  v_hoje date := public._hoje_da_empresa(p_empresa);
  v_sit  text;
  v_est  boolean;
begin
  -- com sessão de usuário, só a própria empresa (não dá para sondar a situação de outro buffet)
  if auth.uid() is not null and p_empresa is distinct from public.empresa_do_usuario() then
    return false;
  end if;
  select * into v_m from public.modulos m where m.codigo = p_modulo;
  if v_m.codigo is null then
    return false;
  end if;
  if v_m.cobranca = 'por_evento' then
    return p_reserva is not null and exists (
      select 1 from public.modulo_compras c
      where c.empresa_id = p_empresa and c.modulo = p_modulo and c.reserva_id = p_reserva
        and c.status = 'paga' and c.acesso_ate is not null and v_hoje <= c.acesso_ate);
  end if;
  v_a := public._modulo_assinatura_referencia(p_empresa, p_modulo);
  if v_a.id is null then
    return false;
  end if;
  v_est := exists (select 1 from public.modulo_cobrancas c
                   where c.modulo_assinatura_id = v_a.id and c.status = 'estornada');
  v_sit := public._modulo_situacao(v_a.status, v_a.pago_ate, v_est, v_hoje);
  return v_sit in ('ativo', 'cancelamento_agendado')
      or public._modulo_na_carencia(v_sit, v_a.pago_ate, v_a.atrasada_desde, v_m.carencia_dias, v_hoje);
end;
$$;

/** Guard das funções de escrita dos módulos: sem direito vigente, recusa com MODULO_INATIVO. */
create or replace function public._exigir_modulo(p_empresa uuid, p_modulo text, p_reserva uuid default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.modulo_acesso(p_empresa, p_modulo, p_reserva) then
    raise exception 'MODULO_INATIVO' using errcode = 'insufficient_privilege', detail = p_modulo;
  end if;
end;
$$;

/**
 * Painel: catálogo + situação de cada módulo para a empresa da sessão (dono e vendedor leem o
 * catálogo; link da fatura e datas só para o dono).
 */
create or replace function public.modulos_da_empresa()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_dono    boolean := public.perfil_do_usuario() = 'dono';
  v_hoje    date;
  v_out     jsonb := '[]'::jsonb;
  v_m       public.modulos;
  v_a       public.modulo_assinaturas;
  v_sit     text;
  v_est     boolean;
  v_fat     public.modulo_cobrancas;
  v_eventos integer;
begin
  if v_empresa is null then
    return '[]'::jsonb;
  end if;
  v_hoje := public._hoje_da_empresa(v_empresa);
  for v_m in select * from public.modulos order by ordem, codigo loop
    v_sit := 'nao_contratado';
    v_fat := null;
    v_eventos := 0;
    v_a := null;
    if v_m.cobranca = 'mensal' then
      v_a := public._modulo_assinatura_referencia(v_empresa, v_m.codigo);
      if v_a.id is not null then
        v_est := exists (select 1 from public.modulo_cobrancas c
                         where c.modulo_assinatura_id = v_a.id and c.status = 'estornada');
        v_sit := public._modulo_situacao(v_a.status, v_a.pago_ate, v_est, v_hoje);
        select * into v_fat from public.modulo_cobrancas c
        where c.modulo_assinatura_id = v_a.id and c.status in ('pendente', 'vencida')
        order by c.vencimento limit 1;
      end if;
    else
      select count(*) into v_eventos from public.modulo_compras c
      where c.empresa_id = v_empresa and c.modulo = v_m.codigo and c.status = 'paga'
        and c.acesso_ate >= v_hoje;
      if v_eventos > 0 then
        v_sit := 'ativo';
      elsif exists (select 1 from public.modulo_compras c
                    where c.empresa_id = v_empresa and c.modulo = v_m.codigo and c.status = 'pendente') then
        v_sit := 'pagamento_pendente';
      end if;
    end if;
    v_out := v_out || jsonb_build_object(
      'codigo', v_m.codigo,
      'nome', v_m.nome,
      'cobranca', v_m.cobranca,
      'preco_centavos', v_m.preco_centavos,
      'venda_liberada', v_m.venda_liberada,
      'carencia_dias', v_m.carencia_dias,
      'acesso_evento_dias', v_m.acesso_evento_dias,
      'situacao', v_sit,
      'acesso', case when v_m.cobranca = 'mensal'
                     then public.modulo_acesso(v_empresa, v_m.codigo) else v_eventos > 0 end,
      'eventos_ativos', v_eventos,
      'pago_ate', case when v_dono then v_a.pago_ate end,
      'link_fatura', case when v_dono then v_fat.link_fatura end,
      'fatura_vencimento', case when v_dono then v_fat.vencimento end,
      'valor_centavos', case when v_dono then v_a.valor_centavos end);
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pagamentos: recalcular o direito a partir das cobranças confirmadas
-- ---------------------------------------------------------------------------

/** Mesmo cálculo de _recalcular_assinatura (mensal): pago até o vencimento pago + 1 mês - 1 dia. */
create or replace function public._modulo_recalcular_assinatura(p_assinatura uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.modulo_assinaturas a where a.id = p_assinatura for update;
  update public.modulo_assinaturas a set
    pago_ate = (select max((c.vencimento + interval '1 month')::date - 1)
                from public.modulo_cobrancas c
                where c.modulo_assinatura_id = a.id and c.status in ('confirmada', 'recebida')),
    atrasada_desde = (select min(c.vencimento) from public.modulo_cobrancas c
                      where c.modulo_assinatura_id = a.id and c.status = 'vencida')
  where a.id = p_assinatura;
  update public.modulo_assinaturas a set status = 'ativa'
  where a.id = p_assinatura and a.status = 'pendente' and a.pago_ate is not null;
end;
$$;

/** Compra por evento: paga (acesso até a data da festa + dias do módulo), estornada ou cancelada. */
create or replace function public._modulo_recalcular_compra(p_compra uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c     public.modulo_compras;
  v_dias  smallint;
  v_data  date;
  v_novo  text;
begin
  select * into v_c from public.modulo_compras c where c.id = p_compra for update;
  if v_c.id is null then
    return;
  end if;
  select case
    when bool_or(m.status = 'estornada') then 'estornada'
    when bool_or(m.status in ('confirmada', 'recebida')) then 'paga'
    when bool_and(m.status = 'cancelada') then 'cancelada'
    else 'pendente' end
  into v_novo
  from public.modulo_cobrancas m where m.modulo_compra_id = v_c.id;
  if v_novo is null or v_c.status = 'estornada' then
    return;
  end if;
  -- pendente/cancelada nunca voltam atrás de paga (evento fora de ordem)
  if v_c.status = 'paga' and v_novo in ('pendente', 'cancelada') then
    return;
  end if;
  select m.acesso_evento_dias into v_dias from public.modulos m where m.codigo = v_c.modulo;
  select r.data into v_data from public.reservas r where r.id = v_c.reserva_id;
  update public.modulo_compras c set
    status = v_novo,
    acesso_ate = case when v_novo = 'paga' and v_dias is not null then v_data + v_dias
                      when v_novo = 'estornada' then null else c.acesso_ate end
  where c.id = v_c.id;
end;
$$;

/** O evento do Asaas é de um módulo? (assinatura de módulo, cobrança de módulo ou referência). */
create or replace function public._modulo_do_evento(p_evento jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(p_evento -> 'cobranca' ->> 'referencia', '') like 'modulo:%'
    or coalesce(p_evento -> 'assinatura_cancelada' ->> 'referencia', '') like 'modulo:%'
    or exists (select 1 from public.modulo_assinaturas a
               where a.asaas_assinatura_id in (p_evento -> 'cobranca' ->> 'assinatura_asaas_id',
                                               p_evento -> 'assinatura_cancelada' ->> 'asaas_id'))
    or exists (select 1 from public.modulo_cobrancas c
               where c.asaas_cobranca_id = p_evento -> 'cobranca' ->> 'asaas_id');
$$;

/**
 * Efeito de um evento do Asaas de módulo (chamado por cobranca_registrar_evento depois de gravar o
 * evento uma vez só). Status monotônico (_cobranca_proximo_status): evento repetido ou fora de
 * ordem não regride nem libera acesso indevido.
 */
create or replace function public._modulo_registrar_evento(p_evento_id uuid, p_evento jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c       jsonb := p_evento -> 'cobranca';
  v_ac      jsonb := p_evento -> 'assinatura_cancelada';
  v_ref     text;
  v_ass     public.modulo_assinaturas;
  v_compra  public.modulo_compras;
  v_atual   public.modulo_cobrancas;
  v_novo    text;
  v_empresa uuid;
  v_res     text;
begin
  -- assinatura de módulo cancelada no Asaas
  if v_ac is not null and jsonb_typeof(v_ac) = 'object' then
    select * into v_ass from public.modulo_assinaturas a where a.asaas_assinatura_id = v_ac ->> 'asaas_id';
    if v_ass.id is null and coalesce(v_ac ->> 'referencia', '') ~ '^modulo:[0-9a-f-]{36}$' then
      select * into v_ass from public.modulo_assinaturas a
      where a.id = substr(v_ac ->> 'referencia', 8)::uuid;
    end if;
    if v_ass.id is null then
      update public.cobranca_eventos set processado_em = now(), resultado = 'sem_empresa'
      where id = p_evento_id;
      return 'sem_empresa';
    end if;
    perform pg_advisory_xact_lock(hashtext('modulo:' || v_ass.empresa_id));
    update public.modulo_assinaturas set status = 'cancelada', cancelada_em = coalesce(cancelada_em, now())
    where id = v_ass.id and status <> 'cancelada';
    update public.cobranca_eventos set empresa_id = v_ass.empresa_id, processado_em = now(),
      resultado = 'modulo_assinatura_cancelada'
    where id = p_evento_id;
    return 'modulo_assinatura_cancelada';
  end if;

  if v_c is null or jsonb_typeof(v_c) <> 'object' then
    update public.cobranca_eventos set ignorado = true, processado_em = now(), resultado = 'ignorado'
    where id = p_evento_id;
    return 'ignorado';
  end if;

  -- de quem é: cobrança já conhecida > assinatura de módulo > referência modulo:<id>
  select * into v_atual from public.modulo_cobrancas c where c.asaas_cobranca_id = v_c ->> 'asaas_id';
  if v_atual.id is not null then
    select * into v_ass from public.modulo_assinaturas a where a.id = v_atual.modulo_assinatura_id;
    select * into v_compra from public.modulo_compras c where c.id = v_atual.modulo_compra_id;
  end if;
  if v_ass.id is null and v_compra.id is null and v_c ->> 'assinatura_asaas_id' is not null then
    select * into v_ass from public.modulo_assinaturas a
    where a.asaas_assinatura_id = v_c ->> 'assinatura_asaas_id';
  end if;
  v_ref := coalesce(v_c ->> 'referencia', '');
  if v_ass.id is null and v_compra.id is null and v_ref ~ '^modulo:[0-9a-f-]{36}$' then
    select * into v_ass from public.modulo_assinaturas a where a.id = substr(v_ref, 8)::uuid;
    if v_ass.id is null then
      select * into v_compra from public.modulo_compras c where c.id = substr(v_ref, 8)::uuid;
    end if;
  end if;
  v_empresa := coalesce(v_ass.empresa_id, v_compra.empresa_id);
  if v_empresa is null then
    update public.cobranca_eventos set processado_em = now(), resultado = 'sem_empresa'
    where id = p_evento_id;
    return 'sem_empresa';
  end if;

  perform pg_advisory_xact_lock(hashtext('modulo:' || v_empresa));
  select * into v_atual from public.modulo_cobrancas c where c.asaas_cobranca_id = v_c ->> 'asaas_id' for update;
  v_novo := public._cobranca_proximo_status(v_atual.status, v_c ->> 'status');

  if v_atual.id is null then
    insert into public.modulo_cobrancas (empresa_id, modulo_assinatura_id, modulo_compra_id,
      asaas_cobranca_id, valor_centavos, vencimento, status, forma, link_fatura, pago_em)
    values (v_empresa, v_ass.id, case when v_ass.id is null then v_compra.id end, v_c ->> 'asaas_id',
      coalesce((v_c ->> 'valor_centavos')::integer, 0), (v_c ->> 'vencimento')::date, v_novo,
      v_c ->> 'forma', v_c ->> 'link_fatura',
      case when v_novo in ('confirmada', 'recebida') then coalesce((v_c ->> 'pago_em')::date::timestamptz, now()) end);
  else
    update public.modulo_cobrancas set
      valor_centavos = coalesce((v_c ->> 'valor_centavos')::integer, valor_centavos),
      vencimento = case when v_novo in ('pendente', 'vencida')
                        then coalesce((v_c ->> 'vencimento')::date, vencimento) else vencimento end,
      status = v_novo,
      forma = coalesce(v_c ->> 'forma', forma),
      link_fatura = coalesce(v_c ->> 'link_fatura', link_fatura),
      pago_em = case when v_novo in ('confirmada', 'recebida')
                     then coalesce(pago_em, (v_c ->> 'pago_em')::date::timestamptz, now()) else pago_em end
    where id = v_atual.id;
  end if;

  if v_ass.id is not null then
    perform public._modulo_recalcular_assinatura(v_ass.id);
    v_res := 'modulo_cobranca';
  else
    perform public._modulo_recalcular_compra(v_compra.id);
    v_res := 'modulo_compra';
  end if;

  if v_novo is distinct from v_atual.status and v_novo in ('confirmada', 'recebida')
     and coalesce(v_atual.status, '') not in ('confirmada', 'recebida') then
    perform public._aviso_donos(v_empresa, 'pagamento_confirmado',
      jsonb_build_object('valor_centavos', (v_c ->> 'valor_centavos')::integer),
      'pagamento_confirmado:modulo:' || (v_c ->> 'asaas_id'));
  end if;

  update public.cobranca_eventos set empresa_id = v_empresa, processado_em = now(), resultado = v_res
  where id = p_evento_id;
  return v_res;
end;
$$;

-- ---------------------------------------------------------------------------
-- cobranca_registrar_evento: igual ao da Etapa 9A, com o desvio para os módulos logo depois de
-- gravar o evento (idempotência e "ignorado" continuam iguais para tudo).
-- ---------------------------------------------------------------------------
create or replace function public.cobranca_registrar_evento(p_evento jsonb, p_payload jsonb default '{}'::jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento    uuid;
  v_c         jsonb := p_evento -> 'cobranca';
  v_ac        jsonb := p_evento -> 'assinatura_cancelada';
  v_ass       public.assinaturas;
  v_empresa   uuid;
  v_ref       text;
  v_atual     public.cobrancas;
  v_novo      text;
  v_cob       uuid;
  v_resultado text;
begin
  insert into public.cobranca_eventos (asaas_evento_id, tipo, payload)
  values (p_evento ->> 'evento_id', p_evento ->> 'tipo', coalesce(p_payload, '{}'::jsonb))
  on conflict (asaas_evento_id) do nothing
  returning id into v_evento;
  if v_evento is null then
    return 'duplicado';
  end if;

  if not coalesce((p_evento ->> 'tratado')::boolean, false) then
    update public.cobranca_eventos set ignorado = true, processado_em = now(), resultado = 'ignorado'
    where id = v_evento;
    return 'ignorado';
  end if;

  -- módulos adicionais: assinaturas e cobranças próprias, fora da situação da conta-base
  if public._modulo_do_evento(p_evento) then
    return public._modulo_registrar_evento(v_evento, p_evento);
  end if;

  -- assinatura cancelada no Asaas
  if v_ac is not null and jsonb_typeof(v_ac) = 'object' then
    select * into v_ass from public.assinaturas a where a.asaas_assinatura_id = v_ac ->> 'asaas_id';
    if v_ass.id is null then
      update public.cobranca_eventos set processado_em = now(), resultado = 'sem_empresa'
      where id = v_evento;
      return 'sem_empresa';
    end if;
    perform pg_advisory_xact_lock(hashtext('cobranca:' || v_ass.empresa_id));
    update public.assinaturas set status = 'cancelada', cancelada_em = coalesce(cancelada_em, now())
    where id = v_ass.id and status <> 'cancelada';
    perform public._atualizar_situacao(v_ass.empresa_id);
    update public.cobranca_eventos set empresa_id = v_ass.empresa_id, processado_em = now(),
      resultado = 'assinatura_cancelada'
    where id = v_evento;
    return 'assinatura_cancelada';
  end if;

  if v_c is null or jsonb_typeof(v_c) <> 'object' then
    update public.cobranca_eventos set ignorado = true, processado_em = now(), resultado = 'ignorado'
    where id = v_evento;
    return 'ignorado';
  end if;

  -- de quem é a cobrança: assinatura > cobrança já conhecida > referência (empresa_id) > cliente
  if v_c ->> 'assinatura_asaas_id' is not null then
    select * into v_ass from public.assinaturas a where a.asaas_assinatura_id = v_c ->> 'assinatura_asaas_id';
    v_empresa := v_ass.empresa_id;
  end if;
  if v_empresa is null then
    select c.empresa_id into v_empresa from public.cobrancas c where c.asaas_cobranca_id = v_c ->> 'asaas_id';
  end if;
  v_ref := v_c ->> 'referencia';
  if v_empresa is null and v_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select e.id into v_empresa from public.empresas e where e.id = v_ref::uuid;
  end if;
  if v_empresa is null and v_c ->> 'cliente_asaas_id' is not null then
    select ec.empresa_id into v_empresa from public.empresas_cobranca ec
    where ec.asaas_cliente_id = v_c ->> 'cliente_asaas_id';
  end if;
  if v_empresa is null then
    update public.cobranca_eventos set processado_em = now(), resultado = 'sem_empresa'
    where id = v_evento;
    return 'sem_empresa';
  end if;

  -- um evento por empresa de cada vez (dois webhooks simultâneos não se atropelam)
  perform pg_advisory_xact_lock(hashtext('cobranca:' || v_empresa));

  select * into v_atual from public.cobrancas c where c.asaas_cobranca_id = v_c ->> 'asaas_id' for update;
  v_novo := public._cobranca_proximo_status(v_atual.status, v_c ->> 'status');

  if v_atual.id is null then
    insert into public.cobrancas (empresa_id, assinatura_id, asaas_cobranca_id, tipo, valor_centavos,
      vencimento, status, forma, link_fatura, pago_em)
    values (v_empresa, v_ass.id, v_c ->> 'asaas_id',
      case when v_ass.id is null then 'implantacao' else 'assinatura' end,
      (v_c ->> 'valor_centavos')::integer, (v_c ->> 'vencimento')::date, v_novo,
      v_c ->> 'forma', v_c ->> 'link_fatura',
      case when v_novo in ('confirmada', 'recebida') then coalesce((v_c ->> 'pago_em')::date::timestamptz, now()) end)
    returning id into v_cob;
  else
    v_cob := v_atual.id;
    update public.cobrancas set
      valor_centavos = coalesce((v_c ->> 'valor_centavos')::integer, valor_centavos),
      vencimento = case when v_novo in ('pendente', 'vencida')
                        then coalesce((v_c ->> 'vencimento')::date, vencimento) else vencimento end,
      status = v_novo,
      forma = coalesce(v_c ->> 'forma', forma),
      link_fatura = coalesce(v_c ->> 'link_fatura', link_fatura),
      pago_em = case when v_novo in ('confirmada', 'recebida')
                     then coalesce(pago_em, (v_c ->> 'pago_em')::date::timestamptz, now()) else pago_em end
    where id = v_atual.id;
  end if;

  if v_ass.id is not null then
    perform public._recalcular_assinatura(v_ass.id);
  end if;

  -- avisos só quando o status muda de verdade
  if v_novo is distinct from v_atual.status then
    if v_novo = 'pendente' and v_atual.id is null then
      perform public._aviso_donos(v_empresa, 'fatura_criada',
        jsonb_build_object('valor_centavos', (v_c ->> 'valor_centavos')::integer,
                           'vencimento', v_c ->> 'vencimento'),
        'fatura_criada:' || v_cob);
    elsif v_novo in ('confirmada', 'recebida') and coalesce(v_atual.status, '') not in ('confirmada', 'recebida') then
      perform public._aviso_donos(v_empresa, 'pagamento_confirmado',
        jsonb_build_object('valor_centavos', (v_c ->> 'valor_centavos')::integer),
        'pagamento_confirmado:' || v_cob);
    elsif v_novo = 'vencida' then
      perform public._aviso_donos(v_empresa, 'pagamento_falhou',
        jsonb_build_object('valor_centavos', (v_c ->> 'valor_centavos')::integer,
                           'vencimento', v_c ->> 'vencimento'),
        'pagamento_falhou:' || v_cob);
    end if;
  end if;

  perform public._atualizar_situacao(v_empresa);
  v_resultado := 'cobranca';
  update public.cobranca_eventos set empresa_id = v_empresa, processado_em = now(), resultado = v_resultado
  where id = v_evento;
  return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public._modulo_situacao(text, date, boolean, date)',
    'public._modulo_na_carencia(text, date, date, smallint, date)',
    'public._modulo_assinatura_referencia(uuid, text)',
    'public._hoje_da_empresa(uuid)',
    'public._exigir_modulo(uuid, text, uuid)',
    'public._modulo_recalcular_assinatura(uuid)',
    'public._modulo_recalcular_compra(uuid)',
    'public._modulo_do_evento(jsonb)',
    'public._modulo_registrar_evento(uuid, jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- leitura do painel e o guard de acesso (o servidor confere antes de cada tela do módulo)
  foreach f in array array[
    'public.modulos_da_empresa()',
    'public.modulo_acesso(uuid, text, uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

-- _modulo_situacao e _modulo_na_carencia também nos testes de equivalência (rodam como postgres)
