-- Etapa 1 · Configuração da empresa para o preço: tipos de evento, espaços, turnos, feriados,
-- ajustes de dia, faixas de deslocamento e regras comerciais.
-- Convenções: dinheiro em centavos (integer), percentuais em basis points (1% = 100 bp),
-- durações em minutos. Toda tabela tem empresa_id; filhas usam FK composta (pai_id, empresa_id).

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.tipo_ajuste_dia as enum ('dia_semana', 'feriado');
create type public.modo_exibicao_preco as enum ('exato', 'faixa', 'apos_contato');
create type public.ajuste_incide as enum ('pacote', 'pacote_opcionais');
create type public.deslocamento_modelo as enum ('nenhum', 'por_km', 'por_faixa');

-- ---------------------------------------------------------------------------
-- tipos_evento
-- ---------------------------------------------------------------------------
create table public.tipos_evento (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  nome           text not null check (char_length(btrim(nome)) between 1 and 80),
  icone          text check (icone ~ '^[a-z0-9-]{1,50}$'),
  ordem          integer not null default 0,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (id, empresa_id)
);

comment on table public.tipos_evento is 'Tipos de festa (aniversário infantil, casamento...). Filtram pacotes e opcionais.';
comment on column public.tipos_evento.icone is 'Nome de ícone do lucide-react (ex.: party-popper).';

create unique index tipos_evento_nome_unico on public.tipos_evento (empresa_id, lower(btrim(nome)));

-- ---------------------------------------------------------------------------
-- espacos
-- ---------------------------------------------------------------------------
create table public.espacos (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas (id) on delete cascade,
  nome                 text not null check (char_length(btrim(nome)) between 1 and 80),
  capacidade_max       integer not null check (capacidade_max between 1 and 100000),
  no_local_do_cliente  boolean not null default false,
  ordem                integer not null default 0,
  ativo                boolean not null default true,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  unique (id, empresa_id)
);

comment on column public.espacos.capacidade_max is 'Capacidade em pessoas físicas (não em convidados equivalentes).';
comment on column public.espacos.no_local_do_cliente is 'Espaço virtual do buffet em domicílio: habilita o deslocamento.';

create index espacos_empresa_id_idx on public.espacos (empresa_id);

-- ---------------------------------------------------------------------------
-- turnos
-- ---------------------------------------------------------------------------
create table public.turnos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  nome           text not null check (char_length(btrim(nome)) between 1 and 60),
  hora_inicio    time not null,
  duracao_min    integer not null check (duracao_min between 1 and 1440),
  dias_semana    smallint[] not null
                   check (cardinality(dias_semana) between 1 and 7
                          and dias_semana <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  ordem          integer not null default 0,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (id, empresa_id)
);

comment on column public.turnos.dias_semana is 'Dias em que o turno existe: 0 = domingo … 6 = sábado.';

create index turnos_empresa_id_idx on public.turnos (empresa_id);

-- ---------------------------------------------------------------------------
-- feriados
-- ---------------------------------------------------------------------------
create table public.feriados (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  data           date not null,
  nome           text not null check (char_length(btrim(nome)) between 1 and 80),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (empresa_id, data)
);

-- ---------------------------------------------------------------------------
-- ajustes_dia (tabela de dia)
-- ---------------------------------------------------------------------------
create table public.ajustes_dia (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  tipo           public.tipo_ajuste_dia not null,
  dia_semana     smallint check (dia_semana between 0 and 6),
  turno_id       uuid,
  ajuste_bp      integer not null check (ajuste_bp between -9000 and 20000),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  check ((tipo = 'dia_semana') = (dia_semana is not null)),
  foreign key (turno_id, empresa_id) references public.turnos (id, empresa_id) on delete cascade,
  unique nulls not distinct (empresa_id, tipo, dia_semana, turno_id)
);

comment on table public.ajustes_dia is
  'Ajuste percentual por dia da semana ou feriado, opcionalmente por turno. Precedência: '
  'feriado+turno > feriado > dia+turno > dia.';

create index ajustes_dia_turno_id_idx on public.ajustes_dia (turno_id);

-- ---------------------------------------------------------------------------
-- faixas_deslocamento (buffet em domicílio, modelo por faixa)
-- ---------------------------------------------------------------------------
create table public.faixas_deslocamento (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  ate_km          integer not null check (ate_km between 1 and 10000),
  valor_centavos  integer not null check (valor_centavos >= 0),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (empresa_id, ate_km)
);

-- ---------------------------------------------------------------------------
-- regras_comerciais (1 linha por empresa)
-- ---------------------------------------------------------------------------
create table public.regras_comerciais (
  empresa_id                      uuid primary key references public.empresas (id) on delete cascade,
  validade_dias                   integer not null default 15 check (validade_dias between 1 and 365),
  prazo_pre_reserva_horas         integer not null default 48 check (prazo_pre_reserva_horas between 1 and 720),
  antecedencia_min_dias           integer not null default 7 check (antecedencia_min_dias between 0 and 365),
  sinal_bp                        integer not null default 3000 check (sinal_bp between 0 and 10000),
  parcelas_max                    integer not null default 3 check (parcelas_max between 1 and 24),
  prazo_ultima_parcela_dias       integer not null default 7 check (prazo_ultima_parcela_dias between 0 and 365),
  formas_pagamento                text[] not null default array['Pix', 'Cartão de crédito']::text[],
  condicoes_texto                 text not null default '',
  nao_incluso_texto               text not null default '',
  cancelamento_texto              text not null default '',
  modo_exibicao_preco             public.modo_exibicao_preco not null default 'exato',
  ajuste_incide                   public.ajuste_incide not null default 'pacote',
  deslocamento_modelo             public.deslocamento_modelo not null default 'nenhum',
  deslocamento_km_gratis          integer not null default 0 check (deslocamento_km_gratis >= 0),
  deslocamento_valor_km_centavos  integer not null default 0 check (deslocamento_valor_km_centavos >= 0),
  criado_em                       timestamptz not null default now(),
  atualizado_em                   timestamptz not null default now()
);

comment on table public.regras_comerciais is 'Regras que aparecem na proposta e entram no preço. Criada junto com a empresa.';

-- ---------------------------------------------------------------------------
-- atualizado_em
-- ---------------------------------------------------------------------------
create trigger tipos_evento_atualizado_em before update on public.tipos_evento
  for each row execute function public.tocar_atualizado_em();
create trigger espacos_atualizado_em before update on public.espacos
  for each row execute function public.tocar_atualizado_em();
create trigger turnos_atualizado_em before update on public.turnos
  for each row execute function public.tocar_atualizado_em();
create trigger feriados_atualizado_em before update on public.feriados
  for each row execute function public.tocar_atualizado_em();
create trigger ajustes_dia_atualizado_em before update on public.ajustes_dia
  for each row execute function public.tocar_atualizado_em();
create trigger faixas_deslocamento_atualizado_em before update on public.faixas_deslocamento
  for each row execute function public.tocar_atualizado_em();
create trigger regras_comerciais_atualizado_em before update on public.regras_comerciais
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- Regras comerciais nascem com a empresa (trigger) + backfill das empresas existentes.
-- ---------------------------------------------------------------------------
create or replace function public.criar_regras_comerciais_faltantes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  criadas integer;
begin
  insert into public.regras_comerciais (empresa_id)
  select e.id from public.empresas e
  on conflict (empresa_id) do nothing;
  get diagnostics criadas = row_count;
  return criadas;
end;
$$;

comment on function public.criar_regras_comerciais_faltantes() is
  'Idempotente: cria regras_comerciais com os padrões para empresas que ainda não têm.';

create or replace function public.criar_regras_da_nova_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.regras_comerciais (empresa_id) values (new.id)
  on conflict (empresa_id) do nothing;
  return new;
end;
$$;

revoke all on function public.criar_regras_comerciais_faltantes() from public, anon, authenticated;
revoke all on function public.criar_regras_da_nova_empresa() from public, anon, authenticated;
grant execute on function public.criar_regras_comerciais_faltantes() to service_role;

create trigger empresas_criar_regras_comerciais
  after insert on public.empresas
  for each row execute function public.criar_regras_da_nova_empresa();

select public.criar_regras_comerciais_faltantes();
