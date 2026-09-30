-- Etapa 1 · Catálogo: pacotes (com faixas de preço e cardápio), faixas de idade, opcionais e
-- vínculos. Filhas usam FK composta (pai_id, empresa_id) → (id, empresa_id): o banco impede
-- vincular dados de empresas diferentes.

-- Exclusion constraint de faixas de idade sem sobreposição (uuid e int4range no mesmo índice).
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.modelo_preco as enum ('por_pessoa', 'por_faixa');
create type public.cobranca_opcional as enum ('por_pessoa', 'fixo', 'por_unidade', 'por_hora');
create type public.relacao_opcional_pacote as enum ('compativel', 'incluso');

-- ---------------------------------------------------------------------------
-- pacotes
-- ---------------------------------------------------------------------------
create table public.pacotes (
  id                         uuid primary key default gen_random_uuid(),
  empresa_id                 uuid not null references public.empresas (id) on delete cascade,
  nome                       text not null check (char_length(btrim(nome)) between 1 and 80),
  subtitulo                  text check (char_length(subtitulo) <= 160),
  descricao                  text check (char_length(descricao) <= 2000),
  destaque                   boolean not null default false,
  modelo_preco               public.modelo_preco not null,
  preco_pessoa_centavos      integer check (preco_pessoa_centavos >= 0),
  valor_excedente_centavos   integer check (valor_excedente_centavos >= 0),
  min_convidados             integer not null default 1 check (min_convidados >= 1),
  max_convidados             integer,
  duracao_inclusa_min        integer not null default 240 check (duracao_inclusa_min between 0 and 1440),
  valor_hora_extra_centavos  integer not null default 0 check (valor_hora_extra_centavos >= 0),
  fotos                      jsonb not null default '[]'::jsonb check (jsonb_typeof(fotos) = 'array'),
  ordem                      integer not null default 0,
  ativo                      boolean not null default true,
  criado_em                  timestamptz not null default now(),
  atualizado_em              timestamptz not null default now(),
  unique (id, empresa_id),
  check (modelo_preco <> 'por_pessoa' or preco_pessoa_centavos is not null),
  check (modelo_preco <> 'por_faixa' or valor_excedente_centavos is not null),
  check (max_convidados is null or max_convidados >= min_convidados)
);

comment on column public.pacotes.min_convidados is 'Mínimo em convidados equivalentes.';
comment on column public.pacotes.fotos is 'Lista de caminhos no Storage (upload entra na Etapa 2).';

create index pacotes_empresa_id_idx on public.pacotes (empresa_id);

-- ---------------------------------------------------------------------------
-- faixas_preco (modelo por faixa)
-- ---------------------------------------------------------------------------
create table public.faixas_preco (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  pacote_id       uuid not null,
  ate_convidados  integer not null check (ate_convidados between 1 and 100000),
  valor_centavos  integer not null check (valor_centavos >= 0),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  foreign key (pacote_id, empresa_id) references public.pacotes (id, empresa_id) on delete cascade,
  unique (pacote_id, ate_convidados)
);

-- ---------------------------------------------------------------------------
-- secoes_cardapio
-- ---------------------------------------------------------------------------
create table public.secoes_cardapio (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  pacote_id      uuid not null,
  nome           text not null check (char_length(btrim(nome)) between 1 and 80),
  itens          text[] not null default '{}'::text[],
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  foreign key (pacote_id, empresa_id) references public.pacotes (id, empresa_id) on delete cascade
);

create index secoes_cardapio_pacote_id_idx on public.secoes_cardapio (pacote_id);

-- ---------------------------------------------------------------------------
-- faixas_idade (política de crianças; pacote_id preenchido sobrescreve a da empresa)
-- ---------------------------------------------------------------------------
create table public.faixas_idade (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  rotulo         text not null check (char_length(btrim(rotulo)) between 1 and 60),
  idade_min      integer not null check (idade_min between 0 and 120),
  idade_max      integer check (idade_max between 0 and 120),
  fator_bp       integer not null check (fator_bp between 0 and 10000),
  pacote_id      uuid,
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  check (idade_max is null or idade_max >= idade_min),
  foreign key (pacote_id, empresa_id) references public.pacotes (id, empresa_id) on delete cascade,
  constraint faixas_idade_sem_sobreposicao exclude using gist (
    empresa_id with =,
    (coalesce(pacote_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    int4range(idade_min, coalesce(idade_max, 120), '[]') with &&
  )
);

comment on column public.faixas_idade.fator_bp is 'Quanto a criança conta como convidado: 0 = isenta, 5000 = meia, 10000 = inteira.';

create index faixas_idade_pacote_id_idx on public.faixas_idade (pacote_id);

-- ---------------------------------------------------------------------------
-- pacote_tipos_evento (nenhum vínculo = pacote vale para todos os tipos)
-- ---------------------------------------------------------------------------
create table public.pacote_tipos_evento (
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  pacote_id       uuid not null,
  tipo_evento_id  uuid not null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  primary key (pacote_id, tipo_evento_id),
  foreign key (pacote_id, empresa_id) references public.pacotes (id, empresa_id) on delete cascade,
  foreign key (tipo_evento_id, empresa_id) references public.tipos_evento (id, empresa_id) on delete cascade
);

create index pacote_tipos_evento_tipo_idx on public.pacote_tipos_evento (tipo_evento_id);

-- ---------------------------------------------------------------------------
-- opcionais
-- ---------------------------------------------------------------------------
create table public.opcionais (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  nome            text not null check (char_length(btrim(nome)) between 1 and 80),
  descricao       text check (char_length(descricao) <= 1000),
  cobranca        public.cobranca_opcional not null,
  preco_centavos  integer not null check (preco_centavos >= 0),
  qtd_min         integer not null default 1 check (qtd_min >= 0),
  qtd_max         integer,
  ordem           integer not null default 0,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (id, empresa_id),
  check (qtd_max is null or qtd_max >= qtd_min)
);

create index opcionais_empresa_id_idx on public.opcionais (empresa_id);

-- ---------------------------------------------------------------------------
-- opcional_pacotes (nenhum 'compativel' = vale para todos; 'incluso' = já vem no pacote)
-- ---------------------------------------------------------------------------
create table public.opcional_pacotes (
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  opcional_id    uuid not null,
  pacote_id      uuid not null,
  relacao        public.relacao_opcional_pacote not null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  primary key (opcional_id, pacote_id),
  foreign key (opcional_id, empresa_id) references public.opcionais (id, empresa_id) on delete cascade,
  foreign key (pacote_id, empresa_id) references public.pacotes (id, empresa_id) on delete cascade
);

create index opcional_pacotes_pacote_idx on public.opcional_pacotes (pacote_id);

-- ---------------------------------------------------------------------------
-- opcional_tipos_evento (nenhum vínculo = vale para todos)
-- ---------------------------------------------------------------------------
create table public.opcional_tipos_evento (
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  opcional_id     uuid not null,
  tipo_evento_id  uuid not null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  primary key (opcional_id, tipo_evento_id),
  foreign key (opcional_id, empresa_id) references public.opcionais (id, empresa_id) on delete cascade,
  foreign key (tipo_evento_id, empresa_id) references public.tipos_evento (id, empresa_id) on delete cascade
);

create index opcional_tipos_evento_tipo_idx on public.opcional_tipos_evento (tipo_evento_id);

-- ---------------------------------------------------------------------------
-- atualizado_em
-- ---------------------------------------------------------------------------
create trigger pacotes_atualizado_em before update on public.pacotes
  for each row execute function public.tocar_atualizado_em();
create trigger faixas_preco_atualizado_em before update on public.faixas_preco
  for each row execute function public.tocar_atualizado_em();
create trigger secoes_cardapio_atualizado_em before update on public.secoes_cardapio
  for each row execute function public.tocar_atualizado_em();
create trigger faixas_idade_atualizado_em before update on public.faixas_idade
  for each row execute function public.tocar_atualizado_em();
create trigger pacote_tipos_evento_atualizado_em before update on public.pacote_tipos_evento
  for each row execute function public.tocar_atualizado_em();
create trigger opcionais_atualizado_em before update on public.opcionais
  for each row execute function public.tocar_atualizado_em();
create trigger opcional_pacotes_atualizado_em before update on public.opcional_pacotes
  for each row execute function public.tocar_atualizado_em();
create trigger opcional_tipos_evento_atualizado_em before update on public.opcional_tipos_evento
  for each row execute function public.tocar_atualizado_em();
