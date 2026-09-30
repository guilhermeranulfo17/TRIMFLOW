-- Etapa 3 · Tabelas da agenda: bloqueios e reservas.
-- Leitura: qualquer usuário ativo da empresa. Escrita: SÓ pelas funções security definer
-- (20261003000003_agenda_funcoes.sql), que fazem a trava e a checagem de conflito.

create type public.tipo_reserva as enum ('pre_reserva', 'confirmada');
create type public.status_reserva as enum ('ativa', 'vencida', 'cancelada', 'realizada');
create type public.origem_reserva as enum ('manual', 'link_publico', 'orcamento');

-- ---------------------------------------------------------------------------
-- bloqueios
-- ---------------------------------------------------------------------------
create table public.bloqueios (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  data        date not null,
  turno_id    uuid,
  espaco_id   uuid,
  motivo      text check (motivo is null or char_length(motivo) <= 200),
  criado_por  uuid references public.usuarios (id) on delete set null,
  criado_em   timestamptz not null default now(),
  foreign key (turno_id, empresa_id) references public.turnos (id, empresa_id) on delete cascade,
  foreign key (espaco_id, empresa_id) references public.espacos (id, empresa_id) on delete cascade,
  unique nulls not distinct (empresa_id, data, turno_id, espaco_id)
);

comment on column public.bloqueios.turno_id is 'null = dia inteiro.';
comment on column public.bloqueios.espaco_id is 'null = todos os espaços.';

create index bloqueios_empresa_data_idx on public.bloqueios (empresa_id, data);

-- ---------------------------------------------------------------------------
-- reservas (pré-reserva e reserva confirmada)
-- ---------------------------------------------------------------------------
create table public.reservas (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references public.empresas (id) on delete cascade,
  espaco_id              uuid not null,
  turno_id               uuid not null,
  data                   date not null,
  inicio                 timestamptz not null,
  fim                    timestamptz not null,
  tipo                   public.tipo_reserva not null,
  status                 public.status_reserva not null default 'ativa',
  expira_em              timestamptz,
  origem                 public.origem_reserva not null default 'manual',
  cliente_nome           text not null check (char_length(btrim(cliente_nome)) between 1 and 120),
  cliente_whatsapp_e164  text check (cliente_whatsapp_e164 is null
                                     or cliente_whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  tipo_evento_id         uuid,
  convidados             integer check (convidados is null or convidados between 1 and 100000),
  valor_total_centavos   integer check (valor_total_centavos is null or valor_total_centavos >= 0),
  sinal_centavos         integer check (sinal_centavos is null or sinal_centavos >= 0),
  sinal_pago_em          date,
  observacoes            text check (observacoes is null or char_length(observacoes) <= 1000),
  lead_id                uuid,  -- sem FK: a tabela de leads nasce na Etapa 4
  orcamento_id           uuid,  -- sem FK: Etapa 5
  criado_por             uuid references public.usuarios (id) on delete set null,
  criado_em              timestamptz not null default now(),
  confirmada_por         uuid references public.usuarios (id) on delete set null,
  confirmada_em          timestamptz,
  cancelada_por          uuid references public.usuarios (id) on delete set null,
  cancelada_em           timestamptz,
  motivo_cancelamento    text check (motivo_cancelamento is null or char_length(motivo_cancelamento) <= 300),
  atualizado_em          timestamptz not null default now(),
  foreign key (espaco_id, empresa_id) references public.espacos (id, empresa_id),
  foreign key (turno_id, empresa_id) references public.turnos (id, empresa_id),
  foreign key (tipo_evento_id, empresa_id) references public.tipos_evento (id, empresa_id) on delete set null (tipo_evento_id),
  check (fim > inicio),
  check ((tipo = 'pre_reserva') = (expira_em is not null))
);

comment on column public.reservas.fim is 'Fim do evento já somado ao intervalo entre eventos da época.';
comment on column public.reservas.expira_em is 'Só pré-reserva. Vencida (expira_em <= now()) conta como livre, mesmo antes do job.';

create index reservas_empresa_data_idx on public.reservas (empresa_id, data);
create index reservas_empresa_espaco_intervalo_idx
  on public.reservas (empresa_id, espaco_id, inicio, fim) where status = 'ativa';

create trigger reservas_atualizado_em before update on public.reservas
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- RLS: leitura na mesma empresa; nenhuma escrita direta.
-- ---------------------------------------------------------------------------
alter table public.bloqueios enable row level security;
alter table public.reservas enable row level security;
revoke all on public.bloqueios, public.reservas from public, anon, authenticated;
grant all on public.bloqueios, public.reservas to service_role;
grant select on public.bloqueios, public.reservas to authenticated;

create policy bloqueios_select_mesma_empresa on public.bloqueios for select to authenticated
  using (empresa_id = public.empresa_do_usuario());
create policy reservas_select_mesma_empresa on public.reservas for select to authenticated
  using (empresa_id = public.empresa_do_usuario());
