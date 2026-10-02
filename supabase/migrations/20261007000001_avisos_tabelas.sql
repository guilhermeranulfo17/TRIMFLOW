-- Etapa 7 · Avisos (painel, push e WhatsApp) e follow-up automático: tabelas.
--
-- Fila "outbox": o aviso nasce na mesma transação do evento (avisos) e cada canal tem sua
-- entrega (avisos_entregas), enviada depois pela rota /api/avisos/processar. Tudo aditivo:
-- o código da Etapa 6 continua funcionando com estas tabelas vazias.

create type public.tipo_aviso as enum (
  'pre_reserva_pedida', 'visita_pedida', 'pre_reserva_vencendo', 'orcamentos_sem_acao',
  'cliente_parou', 'cliente_esquentou', 'resumo_diario', 'teste'
);
create type public.canal_aviso as enum ('painel', 'push', 'whatsapp');
create type public.status_entrega as enum ('pendente', 'enviando', 'enviado', 'falhou', 'ignorado');

-- ---------------------------------------------------------------------------
-- avisos: um por destinatário (o painel é a fonte da verdade)
-- ---------------------------------------------------------------------------
create table public.avisos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  usuario_id     uuid not null,
  tipo           public.tipo_aviso not null,
  lead_id        uuid,
  -- contexto já resolvido para montar o texto (domain/avisos/textos)
  dados          jsonb not null default '{}'::jsonb,
  -- idempotência: gravar duas vezes não duplica (ex.: pre_reserva_pedida:{reserva}:{usuario})
  chave          text not null unique check (char_length(chave) between 1 and 200),
  criado_em      timestamptz not null default now(),
  lido_em        timestamptz,
  -- push e WhatsApp saem a partir daqui (fim do horário de silêncio); o painel mostra na hora
  agendado_para  timestamptz not null default now(),
  -- quantos avisos iguais (mesmo tipo e lead em 10 min) viraram este
  agrupados      integer not null default 1 check (agrupados >= 1),
  unique (id, empresa_id),
  foreign key (usuario_id, empresa_id) references public.usuarios (id, empresa_id) on delete cascade,
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade
);

create index avisos_usuario_idx on public.avisos (usuario_id, criado_em desc);
create index avisos_nao_lidos_idx on public.avisos (usuario_id) where lido_em is null;
create index avisos_lead_tipo_idx on public.avisos (lead_id, tipo, usuario_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- avisos_entregas: uma por canal externo (push, whatsapp)
-- ---------------------------------------------------------------------------
create table public.avisos_entregas (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas (id) on delete cascade,
  aviso_id          uuid not null,
  canal             public.canal_aviso not null check (canal <> 'painel'),
  status            public.status_entrega not null default 'pendente',
  tentativas        integer not null default 0 check (tentativas between 0 and 5),
  proximo_envio_em  timestamptz not null default now(),
  -- "aluguel" enquanto um processador envia (outro não pega a mesma entrega)
  bloqueado_ate     timestamptz,
  enviado_em        timestamptz,
  erro_codigo       text check (erro_codigo is null or char_length(erro_codigo) <= 80),
  atualizado_em     timestamptz not null default now(),
  unique (aviso_id, canal),
  foreign key (aviso_id, empresa_id) references public.avisos (id, empresa_id) on delete cascade
);

create index avisos_entregas_fila_idx on public.avisos_entregas (proximo_envio_em)
  where status in ('pendente', 'enviando');

-- ---------------------------------------------------------------------------
-- push_inscricoes: um aparelho (navegador) por endpoint
-- ---------------------------------------------------------------------------
create table public.push_inscricoes (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  usuario_id     uuid not null,
  endpoint       text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh         text not null check (char_length(p256dh) between 10 and 200),
  auth           text not null check (char_length(auth) between 8 and 100),
  aparelho       text check (aparelho is null or char_length(aparelho) <= 80),
  criado_em      timestamptz not null default now(),
  ultimo_uso_em  timestamptz,
  foreign key (usuario_id, empresa_id) references public.usuarios (id, empresa_id) on delete cascade
);

create index push_inscricoes_usuario_idx on public.push_inscricoes (usuario_id);

-- ---------------------------------------------------------------------------
-- preferencias_avisos: uma linha por usuário, criada sob demanda (sem linha = padrões)
-- ---------------------------------------------------------------------------
create table public.preferencias_avisos (
  usuario_id             uuid primary key,
  empresa_id             uuid not null references public.empresas (id) on delete cascade,
  -- {"tipo": ["push","whatsapp"]}: canais externos ligados por tipo (painel sempre ligado);
  -- tipo ausente = padrão (domain/avisos/canais)
  canais                 jsonb not null default '{}'::jsonb check (jsonb_typeof(canais) = 'object'),
  silencio_inicio        time not null default '22:00',
  silencio_fim           time not null default '07:00',
  -- dono: recebe também os avisos dos leads que têm vendedor responsável
  receber_de_vendedores  boolean not null default false,
  whatsapp_ativo         boolean not null default false,
  whatsapp_numero        text check (whatsapp_numero is null or whatsapp_numero ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_aceite_em     timestamptz,
  atualizado_em          timestamptz not null default now(),
  foreign key (usuario_id, empresa_id) references public.usuarios (id, empresa_id) on delete cascade,
  check (not whatsapp_ativo or (whatsapp_numero is not null and whatsapp_aceite_em is not null))
);

-- ---------------------------------------------------------------------------
-- regras_follow_up: uma linha por (empresa, regra); criadas por trigger
-- ---------------------------------------------------------------------------
create table public.regras_follow_up (
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  regra          text not null check (regra in (
    'sem_resposta_24h', 'segundo_toque', 'proposta_vencendo', 'proposta_vencida',
    'pre_reserva_vencendo', 'visita_amanha', 'pos_visita', 'quente_sem_contato')),
  ligada         boolean not null default true,
  -- prazo editável (horas ou dias conforme a regra; limites em domain/follow-up/regras)
  prazo          integer check (prazo is null or prazo between 1 and 168),
  atualizado_em  timestamptz not null default now(),
  primary key (empresa_id, regra)
);

-- tarefa automática: situação e variáveis da mensagem pronta (o texto é montado pelo domínio)
alter table public.tarefas add column mensagem_dados jsonb
  check (mensagem_dados is null or jsonb_typeof(mensagem_dados) = 'object');

comment on column public.tarefas.mensagem_dados is
  'Tarefa automática (Etapa 7): {situacao, ...variáveis}; a mensagem é montada por domain/leads/mensagens.';

/** Regras padrão de follow-up de uma empresa (idempotente). */
create or replace function public.criar_regras_follow_up(p_empresa uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.regras_follow_up (empresa_id, regra, ligada, prazo)
  values
    (p_empresa, 'sem_resposta_24h', true, 24),
    (p_empresa, 'segundo_toque', true, 3),
    (p_empresa, 'proposta_vencendo', true, 2),
    (p_empresa, 'proposta_vencida', false, null),
    (p_empresa, 'pre_reserva_vencendo', true, 12),
    (p_empresa, 'visita_amanha', true, null),
    (p_empresa, 'pos_visita', true, null),
    (p_empresa, 'quente_sem_contato', true, 2)
  on conflict (empresa_id, regra) do nothing;
$$;

create or replace function public.criar_follow_up_da_nova_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.criar_regras_follow_up(new.id);
  return new;
end;
$$;

revoke all on function public.criar_regras_follow_up(uuid) from public, anon, authenticated;
revoke all on function public.criar_follow_up_da_nova_empresa() from public, anon, authenticated;
grant execute on function public.criar_regras_follow_up(uuid) to service_role;

create trigger empresas_criar_regras_follow_up
  after insert on public.empresas
  for each row execute function public.criar_follow_up_da_nova_empresa();

-- empresas que já existem
select public.criar_regras_follow_up(e.id) from public.empresas e;

-- ---------------------------------------------------------------------------
-- RLS: cada um lê o que é seu; regras: a empresa lê. Nenhuma escrita direta.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['avisos', 'avisos_entregas', 'push_inscricoes', 'preferencias_avisos',
                           'regras_follow_up'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

create policy avisos_select_proprios on public.avisos for select to authenticated
  using (usuario_id = auth.uid() and empresa_id = public.empresa_do_usuario());
create policy avisos_entregas_select_proprias on public.avisos_entregas for select to authenticated
  using (exists (select 1 from public.avisos a
                 where a.id = aviso_id and a.usuario_id = auth.uid()
                   and a.empresa_id = public.empresa_do_usuario()));
create policy push_inscricoes_select_proprias on public.push_inscricoes for select to authenticated
  using (usuario_id = auth.uid() and empresa_id = public.empresa_do_usuario());
create policy preferencias_avisos_select_proprias on public.preferencias_avisos for select to authenticated
  using (usuario_id = auth.uid() and empresa_id = public.empresa_do_usuario());
create policy regras_follow_up_select_empresa on public.regras_follow_up for select to authenticated
  using (empresa_id = public.empresa_do_usuario());
