-- Etapa 6 · Caixa de leads, ações do vendedor e tarefas: campos, tabelas e valores de enum.
-- Tudo aditivo (colunas nullable ou com default, tabelas novas): o código da Etapa 5 continua
-- funcionando. Os valores novos de enum ficam neste arquivo, separados das funções que os usam
-- (um valor novo de enum não pode ser usado na mesma transação em que foi criado).

create type public.motivo_perda as enum (
  'preco', 'data_indisponivel', 'concorrente', 'desistiu', 'sem_resposta', 'fora_da_area', 'outro');
create type public.origem_tarefa as enum ('manual', 'regra');
create type public.canal_contato as enum ('whatsapp', 'ligacao', 'presencial');

alter type public.tipo_atividade add value if not exists 'contato_registrado';
alter type public.tipo_atividade add value if not exists 'nota';
alter type public.tipo_atividade add value if not exists 'tarefa_criada';
alter type public.tipo_atividade add value if not exists 'tarefa_feita';
alter type public.tipo_atividade add value if not exists 'responsavel_alterado';
alter type public.tipo_atividade add value if not exists 'perdido';
alter type public.tipo_atividade add value if not exists 'reaberto';
alter type public.tipo_atividade add value if not exists 'visita_confirmada';
alter type public.tipo_atividade add value if not exists 'visita_realizada';
alter type public.tipo_atividade add value if not exists 'visita_cancelada';
alter type public.tipo_atividade add value if not exists 'mensagem_copiada';

-- FK composta (usuário da MESMA empresa) para responsáveis.
alter table public.usuarios add constraint usuarios_id_empresa_key unique (id, empresa_id);

-- ---------------------------------------------------------------------------
-- leads: responsável, perda, primeiro contato e última ação do vendedor
-- ---------------------------------------------------------------------------
alter table public.leads
  add column responsavel_id          uuid,
  add column motivo_perda_codigo     public.motivo_perda,
  add column perdido_em              timestamptz,
  add column status_antes_de_perder  public.status_lead,
  add column primeiro_contato_em     timestamptz,
  add column ultima_acao_vendedor_em timestamptz,
  add constraint leads_responsavel_fk foreign key (responsavel_id, empresa_id)
    references public.usuarios (id, empresa_id) on delete set null (responsavel_id),
  add constraint leads_motivo_outro_ck check (
    motivo_perda_codigo is distinct from 'outro'
    or char_length(btrim(coalesce(motivo_perda, ''))) > 0);

comment on column public.leads.responsavel_id is
  'Quem cuida do lead. Nasce vazio; a primeira ação de um usuário o torna responsável.';
comment on column public.leads.motivo_perda is 'Detalhe livre da perda (obrigatório quando o código é "outro").';
comment on column public.leads.status_antes_de_perder is 'Para reabrir voltando ao estado certo.';
comment on column public.leads.primeiro_contato_em is 'Primeira ação do vendedor (métrica de tempo até a primeira ação).';

create index leads_empresa_responsavel_idx on public.leads (empresa_id, responsavel_id)
  where responsavel_id is not null;
create index leads_empresa_proximo_contato_idx on public.leads (empresa_id, proximo_contato_em)
  where proximo_contato_em is not null;
create index leads_empresa_caixa_idx on public.leads (empresa_id, eh_teste, status, ultima_atividade_em desc);

-- ---------------------------------------------------------------------------
-- visitas: hora combinada e o ciclo de vida (confirmar, realizar, cancelar)
-- ---------------------------------------------------------------------------
alter table public.visitas
  add column data_hora           timestamptz,
  add column confirmada_por      uuid references public.usuarios (id) on delete set null,
  add column confirmada_em       timestamptz,
  add column realizada_em        timestamptz,
  add column cancelada_em        timestamptz,
  add column motivo_cancelamento text check (motivo_cancelamento is null or char_length(motivo_cancelamento) <= 300),
  add column criado_por          uuid references public.usuarios (id) on delete set null;

comment on column public.visitas.data_hora is
  'Dia e hora combinados (visita confirmada). O pedido do link continua com data_preferida e periodo.';

create index visitas_empresa_data_hora_idx on public.visitas (empresa_id, data_hora)
  where status = 'confirmada';

-- ---------------------------------------------------------------------------
-- notas do vendedor no lead
-- ---------------------------------------------------------------------------
create table public.notas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  lead_id     uuid not null,
  autor_id    uuid references public.usuarios (id) on delete set null,
  texto       text not null check (char_length(btrim(texto)) between 1 and 2000),
  criado_em   timestamptz not null default now(),
  editado_em  timestamptz,
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade
);

comment on table public.notas is 'Anotações do vendedor. Só o autor edita ou apaga (24h); o dono apaga qualquer uma.';

create index notas_lead_idx on public.notas (lead_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- tarefas (manuais nesta etapa; a Etapa 7 cria por regra de follow-up)
-- ---------------------------------------------------------------------------
create table public.tarefas (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas (id) on delete cascade,
  lead_id            uuid not null,
  orcamento_id       uuid,
  titulo             text not null check (char_length(btrim(titulo)) between 1 and 160),
  descricao          text check (descricao is null or char_length(descricao) <= 1000),
  responsavel_id     uuid,
  vence_em           timestamptz not null,
  adiada_para        timestamptz,
  -- vencimento efetivo: o adiado, se houver
  vence_efetivo      timestamptz generated always as (coalesce(adiada_para, vence_em)) stored,
  feita_em           timestamptz,
  feita_por          uuid references public.usuarios (id) on delete set null,
  cancelada_em       timestamptz,
  origem             public.origem_tarefa not null default 'manual',
  regra              text check (regra is null or regra ~ '^[a-z0-9_]{1,60}$'),
  mensagem_sugerida  text check (mensagem_sugerida is null or char_length(mensagem_sugerida) <= 1000),
  criado_por         uuid references public.usuarios (id) on delete set null,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  unique (id, empresa_id),
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade,
  foreign key (orcamento_id, empresa_id) references public.orcamentos (id, empresa_id)
    on delete set null (orcamento_id),
  foreign key (responsavel_id, empresa_id) references public.usuarios (id, empresa_id)
    on delete set null (responsavel_id),
  check (feita_em is null or cancelada_em is null)
);

comment on column public.tarefas.regra is
  'Chave da regra que criou a tarefa (Etapa 7, ex.: sem_resposta_24h) ou "proximo_contato".';

-- No máximo UMA tarefa aberta por regra no mesmo lead (as regras da Etapa 7 dependem disso).
create unique index tarefas_regra_aberta_idx on public.tarefas (lead_id, regra)
  where regra is not null and feita_em is null and cancelada_em is null;
create index tarefas_abertas_idx on public.tarefas (empresa_id, responsavel_id, vence_efetivo)
  where feita_em is null and cancelada_em is null;
create index tarefas_lead_idx on public.tarefas (lead_id, vence_efetivo);
create index tarefas_feitas_idx on public.tarefas (empresa_id, feita_em desc) where feita_em is not null;

create trigger tarefas_atualizado_em before update on public.tarefas
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- RLS: leitura na mesma empresa; nenhuma escrita direta (só pelas funções).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['notas', 'tarefas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (empresa_id = public.empresa_do_usuario())',
      t || '_select_mesma_empresa', t);
  end loop;
end;
$$;
