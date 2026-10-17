-- Etapa 14 · Vendas Orkestra: CRM interno da equipe Orkestra para vender o próprio Orkestra a
-- donos de buffet (prospecção ativa, copiloto de IA). Tudo aditivo: tabelas novas, nada do
-- código anterior muda.
--
-- Regras (docs/ARQUITETURA.md §77):
--  * NÃO é dado de buffet: nenhuma tabela tem empresa_id e nada se mistura com public.leads.
--  * Só o /interno lê e escreve, pela conexão administrativa, depois de exigirAdmin()
--    (ORKESTRA_ADMINS + MFA). anon e authenticated não têm privilégio nenhum (igual à
--    auditoria_interna); RLS ligado e sem policy.
--  * Sem _exigir_escrita: a trava de conta suspensa e da demo é dos buffets (empresa_id).
--  * A etapa do lead de vendas é gravada (ao contrário do funil dos buffets); toda mudança vira
--    uma linha em vendas_movimentos, com origem (manual ou agente) e motivo.

create type public.vendas_etapa as enum (
  'novo', 'abordado', 'respondeu', 'interessado', 'fechando', 'cliente', 'perdido'
);
create type public.vendas_autor as enum ('lead', 'gui', 'conversa');
create type public.vendas_origem_movimento as enum ('manual', 'agente', 'importacao');
create type public.vendas_status_sugestao as enum ('pendente', 'aprovada', 'descartada');
create type public.vendas_tipo_conhecimento as enum ('produto', 'preco', 'objecao', 'script');
create type public.vendas_avaliacao as enum ('boa', 'ruim');

-- ---------------------------------------------------------------------------
-- leads de vendas (donos de buffet prospectados)
-- ---------------------------------------------------------------------------
create table public.vendas_leads (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null check (char_length(btrim(nome)) between 2 and 120),
  buffet            text check (buffet is null or char_length(buffet) <= 160),
  telefone_e164     text check (telefone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  cidade            text check (cidade is null or char_length(cidade) <= 120),
  origem            text check (origem is null or char_length(origem) <= 80),
  etapa             public.vendas_etapa not null default 'novo',
  resumo            text check (resumo is null or char_length(resumo) <= 2000),
  -- data civil no fuso America/Sao_Paulo (yyyy-MM-dd), como o dia do evento dos buffets
  proximo_followup  date,
  -- mensagens enviadas sem resposta desde a última resposta do lead (máximo de 3 no domínio)
  tentativas        smallint not null default 0 check (tentativas between 0 and 20),
  nao_contatar      boolean not null default false,
  nao_contatar_em   timestamptz,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

comment on table public.vendas_leads is
  'Vendas Orkestra: dono de buffet prospectado pela equipe. Não é lead de buffet (public.leads).';

create unique index vendas_leads_telefone_idx on public.vendas_leads (telefone_e164)
  where telefone_e164 is not null;
create index vendas_leads_etapa_idx on public.vendas_leads (etapa, atualizado_em desc);
create index vendas_leads_followup_idx on public.vendas_leads (proximo_followup)
  where not nao_contatar and etapa not in ('cliente', 'perdido');

create trigger vendas_leads_atualizado_em
  before update on public.vendas_leads
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- sugestões do copiloto (cada "Gerar resposta")
-- ---------------------------------------------------------------------------
create table public.vendas_sugestoes (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid not null references public.vendas_leads (id) on delete cascade,
  -- o que foi colado (resposta do lead ou a conversa inteira)
  entrada             text not null check (char_length(entrada) between 1 and 20000),
  -- saída do agente já validada (diagnostico, mensagem, etapa, resumo, proximo_followup,
  -- angulo, passar_para_humano, nao_contatar, motivo)
  saida               jsonb not null,
  mensagem_sugerida   text not null check (char_length(mensagem_sugerida) <= 4000),
  mensagem_final      text check (mensagem_final is null or char_length(mensagem_final) <= 4000),
  editada             boolean not null default false,
  status              public.vendas_status_sugestao not null default 'pendente',
  prompt_versao       text not null check (char_length(prompt_versao) between 1 and 40),
  provedor            text not null check (char_length(provedor) between 1 and 40),
  modelo              text not null check (char_length(modelo) between 1 and 100),
  -- ids dos exemplos injetados no prompt (bons, ruins e pares editados)
  exemplos_usados     jsonb not null default '[]'::jsonb,
  criado_em           timestamptz not null default now(),
  decidido_em         timestamptz,
  check ((status = 'pendente') = (decidido_em is null)),
  check (status <> 'aprovada' or mensagem_final is not null)
);

create index vendas_sugestoes_lead_idx on public.vendas_sugestoes (lead_id, criado_em desc);
create index vendas_sugestoes_editadas_idx on public.vendas_sugestoes (criado_em desc)
  where editada and status = 'aprovada';

-- ---------------------------------------------------------------------------
-- histórico da conversa
-- ---------------------------------------------------------------------------
create table public.vendas_mensagens (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.vendas_leads (id) on delete cascade,
  autor        public.vendas_autor not null,
  texto        text not null check (char_length(texto) between 1 and 20000),
  -- mensagem do Gui que veio de uma sugestão aprovada
  sugestao_id  uuid references public.vendas_sugestoes (id) on delete set null,
  criado_em    timestamptz not null default now()
);

create index vendas_mensagens_lead_idx on public.vendas_mensagens (lead_id, criado_em);
create index vendas_mensagens_sugestao_idx on public.vendas_mensagens (sugestao_id);

-- ---------------------------------------------------------------------------
-- movimentos no pipeline (quem moveu e por quê)
-- ---------------------------------------------------------------------------
create table public.vendas_movimentos (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.vendas_leads (id) on delete cascade,
  de           public.vendas_etapa,
  para         public.vendas_etapa not null,
  origem       public.vendas_origem_movimento not null,
  motivo       text check (motivo is null or char_length(motivo) <= 500),
  sugestao_id  uuid references public.vendas_sugestoes (id) on delete set null,
  criado_em    timestamptz not null default now(),
  check (de is distinct from para)
);

create index vendas_movimentos_lead_idx on public.vendas_movimentos (lead_id, criado_em desc);
create index vendas_movimentos_sugestao_idx on public.vendas_movimentos (sugestao_id);

-- ---------------------------------------------------------------------------
-- base de conhecimento (o agente só afirma o que estiver aqui)
-- ---------------------------------------------------------------------------
create table public.vendas_conhecimento (
  id             uuid primary key default gen_random_uuid(),
  tipo           public.vendas_tipo_conhecimento not null,
  titulo         text not null check (char_length(btrim(titulo)) between 2 and 160),
  conteudo       text not null check (char_length(btrim(conteudo)) between 2 and 8000),
  ativo          boolean not null default true,
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index vendas_conhecimento_tipo_idx on public.vendas_conhecimento (tipo, ordem)
  where ativo;

create trigger vendas_conhecimento_atualizado_em
  before update on public.vendas_conhecimento
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- exemplos: uma sugestão marcada como boa ou ruim, com o motivo em uma frase
-- ---------------------------------------------------------------------------
create table public.vendas_exemplos (
  id           uuid primary key default gen_random_uuid(),
  sugestao_id  uuid not null unique references public.vendas_sugestoes (id) on delete cascade,
  avaliacao    public.vendas_avaliacao not null,
  motivo       text not null check (char_length(btrim(motivo)) between 3 and 200),
  criado_em    timestamptz not null default now()
);

create index vendas_exemplos_avaliacao_idx on public.vendas_exemplos (avaliacao, criado_em desc);

-- ---------------------------------------------------------------------------
-- acesso: só a conexão administrativa (/interno). Nenhuma policy de propósito.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['vendas_leads', 'vendas_sugestoes', 'vendas_mensagens',
                           'vendas_movimentos', 'vendas_conhecimento', 'vendas_exemplos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;
