-- Etapa 10 · PR 1 · Contrato digital com assinatura eletrônica simples (aceite com registro).
-- Tudo aditivo: tabelas novas, uma coluna nova em planos (com valor só no Essencial), uma
-- restrição única nova em reservas e funções novas. O código anterior não usa nada disto.
--
-- Regras (docs/ARQUITETURA.md §70):
--  * Escrita só por funções: o dono emite (e assina) pelo painel; o cliente assina pelo link,
--    pelas funções do schema publico (só anon, pelo servidor com comAnon).
--  * Texto, valores e impressão digital (SHA-256) congelados no envio. Para mudar: cancelar e
--    gerar outro (número novo, versão + 1, ligado ao anterior).
--  * Link: só o hash do token fica no banco; token inexistente, vencido ou cancelado dão a
--    mesma resposta. Código por e-mail: só o hash, 10 minutos, 5 tentativas.
--  * CPF: cifrado pelo servidor (AES-256-GCM, chave fora do banco); aqui só o texto cifrado e a
--    versão mascarada.

-- ---------------------------------------------------------------------------------------------
-- 1. Plano: contratos por mês (null = sem limite). Essencial: 10; Profissional e teste: livre.
-- ---------------------------------------------------------------------------------------------

alter table public.planos
  add column if not exists contratos_mes integer check (contratos_mes is null or contratos_mes >= 0);
update public.planos set contratos_mes = 10 where codigo = 'essencial' and contratos_mes is null;
comment on column public.planos.contratos_mes is
  'Contratos enviados por mês (no fuso da empresa). Null = sem limite. Leads de teste não contam.';

-- Contrato aponta para a reserva com FK composta (mesma empresa)
alter table public.reservas add constraint reservas_id_empresa_key unique (id, empresa_id);

-- Limites do link do contrato em publico.tentativas
alter table publico.tentativas drop constraint if exists tentativas_acao_check;
alter table publico.tentativas add constraint tentativas_acao_check
  check (acao in ('iniciar', 'pre_reserva', 'visita', 'funil', 'abertura', 'pdf',
                  'login', 'cadastro', 'recuperar_senha', 'webhook', 'cron',
                  'contrato_abrir', 'contrato_codigo', 'contrato_assinar', 'contrato_recusar',
                  'contrato_pdf'));
alter table publico.tentativas drop constraint if exists tentativas_chave_tipo_check;
alter table publico.tentativas add constraint tentativas_chave_tipo_check
  check (chave_tipo in ('ip', 'whatsapp', 'empresa', 'email', 'contrato'));

-- ---------------------------------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------------------------------

create table public.contrato_modelos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  titulo      text not null check (char_length(btrim(titulo)) between 2 and 120),
  segmento    public.segmento_empresa not null,
  texto       text not null check (char_length(texto) between 20 and 60000),
  opcoes      jsonb not null default '{}'::jsonb check (jsonb_typeof(opcoes) = 'object'),
  -- de qual modelo do sistema a cópia saiu ("infantil@1")
  origem      text check (origem is null or origem ~ '^[a-z_]+@[0-9]{1,4}$'),
  versao      integer not null default 1 check (versao >= 1),
  ativo       boolean not null default true,
  criado_por  uuid references public.usuarios (id) on delete set null,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, empresa_id)
);
create index contrato_modelos_empresa_idx on public.contrato_modelos (empresa_id, ativo);
create index contrato_modelos_criado_por_idx on public.contrato_modelos (criado_por);

comment on table public.contrato_modelos is
  'Modelos de contrato da empresa (cópias editáveis dos modelos do sistema). Escrita só por salvar_contrato_modelo.';

create table public.contratos (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references public.empresas (id) on delete cascade,
  ano                   smallint not null check (ano between 2020 and 2200),
  numero                integer not null check (numero > 0),
  versao                integer not null default 1 check (versao >= 1),
  substitui_contrato_id uuid,
  lead_id               uuid not null,
  orcamento_id          uuid,
  reserva_id            uuid,
  modelo_id             uuid,
  modelo_origem         text check (modelo_origem is null or char_length(modelo_origem) <= 40),
  titulo                text not null check (char_length(btrim(titulo)) between 2 and 160),
  status                public.status_contrato not null default 'rascunho',
  -- texto final (variáveis preenchidas), normalizado pelo servidor; hash = sha256 dele
  texto                 text not null check (char_length(texto) between 20 and 80000),
  hash                  text not null check (hash ~ '^[0-9a-f]{64}$'),
  -- valores usados (total, sinal, saldo, data, convidados, espaço…) e as variáveis preenchidas
  valores               jsonb not null default '{}'::jsonb check (jsonb_typeof(valores) = 'object'),
  variaveis             jsonb not null default '{}'::jsonb check (jsonb_typeof(variaveis) = 'object'),
  exige_codigo          boolean not null default false,
  email_cliente         text check (email_cliente is null
                                    or (char_length(email_cliente) <= 200
                                        and email_cliente ~ '^[^@\s]+@[^@\s]+$')),
  token_hash            text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  expira_em             timestamptz,
  enviado_em            timestamptz,
  enviado_por           uuid references public.usuarios (id) on delete set null,
  visualizado_em        timestamptz,
  concluido_em          timestamptz,
  recusado_em           timestamptz,
  recusa_motivo         text check (recusa_motivo is null or char_length(recusa_motivo) <= 500),
  cancelado_em          timestamptz,
  cancelado_por         uuid references public.usuarios (id) on delete set null,
  cancelamento_motivo   text check (cancelamento_motivo is null or char_length(cancelamento_motivo) <= 300),
  pdf_gerado_em         timestamptz,
  anonimizado_em        timestamptz,
  eh_teste              boolean not null default false,
  criado_por            uuid references public.usuarios (id) on delete set null,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  unique (id, empresa_id),
  unique (empresa_id, ano, numero),
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade,
  foreign key (orcamento_id, empresa_id) references public.orcamentos (id, empresa_id)
    on delete set null (orcamento_id),
  foreign key (reserva_id, empresa_id) references public.reservas (id, empresa_id)
    on delete set null (reserva_id),
  foreign key (modelo_id, empresa_id) references public.contrato_modelos (id, empresa_id)
    on delete set null (modelo_id),
  foreign key (substitui_contrato_id, empresa_id) references public.contratos (id, empresa_id)
    on delete set null (substitui_contrato_id),
  check (status = 'rascunho' or (token_hash is not null and expira_em is not null
                                 and enviado_em is not null))
);
create index contratos_lead_idx on public.contratos (lead_id, empresa_id);
create index contratos_orcamento_idx on public.contratos (orcamento_id, empresa_id);
create index contratos_reserva_idx on public.contratos (reserva_id, empresa_id);
create index contratos_modelo_idx on public.contratos (modelo_id, empresa_id);
create index contratos_substitui_idx on public.contratos (substitui_contrato_id, empresa_id);
create index contratos_empresa_status_idx on public.contratos (empresa_id, status, enviado_em desc);
create index contratos_enviado_por_idx on public.contratos (enviado_por);
create index contratos_cancelado_por_idx on public.contratos (cancelado_por);
create index contratos_criado_por_idx on public.contratos (criado_por);
create index contratos_vencendo_idx on public.contratos (expira_em) where status = 'enviado';

comment on table public.contratos is
  'Contratos digitais. Texto, valores e hash congelados no envio (trigger). Escrita só por funções.';
comment on column public.contratos.token_hash is 'sha256 do token do link (o token em si nunca é guardado).';

create table public.contrato_assinaturas (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas (id) on delete cascade,
  contrato_id         uuid not null,
  parte               public.parte_contrato not null,
  -- quem assinou (pessoa) e, no buffet, a empresa que ela representa
  nome                text not null check (char_length(btrim(nome)) between 2 and 120),
  representa          text check (representa is null or char_length(representa) <= 160),
  -- cliente: CPF cifrado pelo servidor ("v1:…") e mascarado; buffet: CNPJ (dado público)
  documento_cifrado   text check (documento_cifrado is null
                                  or (documento_cifrado ~ '^v1:[A-Za-z0-9_-]+$'
                                      and char_length(documento_cifrado) between 24 and 404)),
  documento_mascarado text check (documento_mascarado is null or char_length(documento_mascarado) <= 30),
  usuario_id          uuid references public.usuarios (id) on delete set null,
  assinado_em         timestamptz not null default now(),
  ip_hash             text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent          text check (user_agent is null or char_length(user_agent) <= 400),
  hash_documento      text not null check (hash_documento ~ '^[0-9a-f]{64}$'),
  metodo              public.metodo_assinatura not null,
  codigo_verificado   boolean not null default false,
  anonimizado_em      timestamptz,
  unique (contrato_id, parte),
  foreign key (contrato_id, empresa_id) references public.contratos (id, empresa_id) on delete cascade
);
create index contrato_assinaturas_contrato_idx on public.contrato_assinaturas (contrato_id, empresa_id);
create index contrato_assinaturas_empresa_idx on public.contrato_assinaturas (empresa_id);
create index contrato_assinaturas_usuario_idx on public.contrato_assinaturas (usuario_id);

comment on table public.contrato_assinaturas is
  'Uma assinatura por parte: registro de data, hora, IP (hash), aparelho e hash do texto assinado.';

create table public.contrato_codigos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  contrato_id uuid not null,
  codigo_hash text not null check (codigo_hash ~ '^[0-9a-f]{64}$'),
  expira_em   timestamptz not null,
  tentativas  smallint not null default 0 check (tentativas between 0 and 50),
  usado_em    timestamptz,
  criado_em   timestamptz not null default now(),
  foreign key (contrato_id, empresa_id) references public.contratos (id, empresa_id) on delete cascade
);
create index contrato_codigos_contrato_idx on public.contrato_codigos (contrato_id, empresa_id, criado_em desc);
create index contrato_codigos_empresa_idx on public.contrato_codigos (empresa_id);

comment on table public.contrato_codigos is
  'Códigos de 6 dígitos por e-mail (só o hash). Ninguém do navegador lê; só as funções do link.';

create trigger contrato_modelos_atualizado_em before update on public.contrato_modelos
  for each row execute function public.tocar_atualizado_em();
create trigger contratos_atualizado_em before update on public.contratos
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------------------------
-- 3. Imutabilidade
-- ---------------------------------------------------------------------------------------------

/**
 * Contrato: o hash é sempre o sha256 do texto; depois do envio, texto, valores, partes e hash não
 * mudam e concluído/cancelado não muda de status. Só a anonimização da LGPD (GUC orkestra.lgpd)
 * pode reescrever o texto. Apagar: nunca com sessão de usuário (cascata da empresa e jobs, sim).
 */
create or replace function public._contrato_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null and old.status <> 'rascunho' then
      raise exception 'CONTRATO_IMUTAVEL' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if coalesce(current_setting('orkestra.lgpd', true), '') = '1' then
    return new;
  end if;
  if new.hash <> encode(sha256(convert_to(new.texto, 'UTF8')), 'hex') then
    raise exception 'CONTRATO_HASH_INVALIDO' using errcode = 'check_violation';
  end if;
  if new.texto ~ '\{\{|\[\[FALTA:' then
    raise exception 'CONTRATO_VARIAVEL_FALTANDO' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.status <> 'rascunho' then
    if new.texto is distinct from old.texto or new.hash is distinct from old.hash
       or new.valores is distinct from old.valores or new.variaveis is distinct from old.variaveis
       or new.titulo is distinct from old.titulo or new.lead_id is distinct from old.lead_id
       or new.empresa_id is distinct from old.empresa_id or new.ano is distinct from old.ano
       or new.numero is distinct from old.numero or new.versao is distinct from old.versao
       or new.exige_codigo is distinct from old.exige_codigo
       or new.email_cliente is distinct from old.email_cliente
       or new.enviado_em is distinct from old.enviado_em
       or (new.orcamento_id is not null and new.orcamento_id is distinct from old.orcamento_id)
       or (new.reserva_id is not null and new.reserva_id is distinct from old.reserva_id) then
      raise exception 'CONTRATO_IMUTAVEL' using errcode = 'check_violation';
    end if;
    if old.status in ('concluido', 'cancelado') and new.status is distinct from old.status then
      raise exception 'CONTRATO_IMUTAVEL' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger contratos_imutavel before insert or update or delete on public.contratos
  for each row execute function public._contrato_imutavel();

/** Assinatura nunca muda (só a anonimização da LGPD) e não é apagada com sessão de usuário. */
create or replace function public._contrato_assinatura_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null then
      raise exception 'CONTRATO_IMUTAVEL' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if coalesce(current_setting('orkestra.lgpd', true), '') <> '1' then
    raise exception 'CONTRATO_IMUTAVEL' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger contrato_assinaturas_imutavel before update or delete on public.contrato_assinaturas
  for each row execute function public._contrato_assinatura_imutavel();

-- ---------------------------------------------------------------------------------------------
-- 4. RLS, grants e trava de conta suspensa / demo
-- ---------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['contrato_modelos', 'contratos', 'contrato_assinaturas', 'contrato_codigos'] loop
    execute format('create trigger %I before insert or update or delete on public.%I '
                   'for each row execute function public._exigir_escrita()', t || '_somente_leitura', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  -- o painel só lê (o dono); códigos, ninguém do navegador lê
  foreach t in array array['contrato_modelos', 'contratos', 'contrato_assinaturas'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (empresa_id = (select public.empresa_do_usuario())
                and (select public.perfil_do_usuario()) = ''dono'')',
      t || '_select_dono', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Funções do painel (dono)
-- ---------------------------------------------------------------------------------------------

create or replace function public._contrato_dono()
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
    raise exception 'CONTRATO_SO_DONO' using errcode = 'insufficient_privilege';
  end if;
  return v;
end;
$$;

/** "11.222.333/0001-81" */
create or replace function public._formatar_cnpj(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p ~ '^[0-9]{14}$'
    then substr(p, 1, 2) || '.' || substr(p, 3, 3) || '.' || substr(p, 6, 3) || '/'
         || substr(p, 9, 4) || '-' || substr(p, 13, 2)
    else p end;
$$;

/**
 * Salva um modelo da empresa: {id?, titulo, segmento, texto, opcoes, origem?, ativo}. Sem id =
 * novo. Editar sobe a versão. As variáveis são conferidas pelo servidor (domain/contratos);
 * aqui, tamanhos e o formato das opções. Devolve o id.
 */
create or replace function public.salvar_contrato_modelo(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u     public.usuarios := public._contrato_dono();
  v_id    uuid;
  v_antes public.contrato_modelos;
begin
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(coalesce(p -> 'opcoes', '{}')) <> 'object' then
    raise exception 'CONTRATO_MODELO_INVALIDO' using errcode = 'check_violation';
  end if;
  if (p ->> 'texto') ~ '\[\[FALTA:' then
    raise exception 'CONTRATO_MODELO_INVALIDO' using errcode = 'check_violation';
  end if;
  v_id := nullif(p ->> 'id', '')::uuid;
  if v_id is null then
    insert into public.contrato_modelos (empresa_id, titulo, segmento, texto, opcoes, origem, ativo, criado_por)
    values (v_u.empresa_id, btrim(p ->> 'titulo'), (p ->> 'segmento')::public.segmento_empresa,
            p ->> 'texto', coalesce(p -> 'opcoes', '{}'::jsonb), nullif(p ->> 'origem', ''),
            coalesce((p ->> 'ativo')::boolean, true), v_u.id)
    returning id into v_id;
    insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
    values (v_u.empresa_id, v_u.id, 'contrato_modelo.criado', 'contrato_modelo', v_id,
            jsonb_build_object('titulo', btrim(p ->> 'titulo'), 'origem', p ->> 'origem'));
    return v_id;
  end if;

  select * into v_antes from public.contrato_modelos m
  where m.id = v_id and m.empresa_id = v_u.empresa_id for update;
  if v_antes.id is null then
    raise exception 'CONTRATO_MODELO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  update public.contrato_modelos set
    titulo = coalesce(btrim(p ->> 'titulo'), titulo),
    texto = coalesce(p ->> 'texto', texto),
    opcoes = coalesce(p -> 'opcoes', opcoes),
    ativo = coalesce((p ->> 'ativo')::boolean, ativo),
    versao = case when coalesce(p ->> 'texto', texto) is distinct from texto
                    or coalesce(p -> 'opcoes', opcoes) is distinct from opcoes
                  then versao + 1 else versao end
  where id = v_id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'contrato_modelo.alterado', 'contrato_modelo', v_id,
          jsonb_build_object('titulo', v_antes.titulo, 'versao_antes', v_antes.versao,
                             'ativo', coalesce((p ->> 'ativo')::boolean, v_antes.ativo)));
  return v_id;
end;
$$;

/** Contratos enviados no mês corrente (fuso da empresa), sem os de teste. */
create or replace function public._contratos_no_mes(p_empresa uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.contratos c, public.empresas e
  where e.id = p_empresa and c.empresa_id = p_empresa and not c.eh_teste
    and c.enviado_em >= (date_trunc('month', now() at time zone e.fuso) at time zone e.fuso);
$$;

/**
 * Envia um contrato (o dono assina ao enviar). p:
 *   lead_id, orcamento_id?, reserva_id?, modelo_id?, modelo_origem?, titulo, texto, valores,
 *   variaveis, exige_codigo, email_cliente?, validade_dias (1 a 60, padrão 14), token_hash,
 *   substitui_contrato_id?, ip_hash?, user_agent?
 * O texto já vem normalizado e preenchido; o hash é calculado aqui. Refazer: o anterior é
 * cancelado (se ainda não estava) e o novo leva versão + 1. Devolve {id, ano, numero, versao,
 * expira_em}.
 */
create or replace function public.emitir_contrato(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u        public.usuarios := public._contrato_dono();
  v_e        public.empresas;
  v_lead     public.leads;
  v_o        public.orcamentos;
  v_r        public.reservas;
  v_ant      public.contratos;
  v_plano    public.planos;
  v_c        public.contratos;
  v_validade integer := coalesce(nullif(p ->> 'validade_dias', '')::integer, 14);
  v_texto    text := p ->> 'texto';
  v_exige    boolean := coalesce((p ->> 'exige_codigo')::boolean, false);
  v_email    text := nullif(btrim(coalesce(p ->> 'email_cliente', '')), '');
  v_ano      integer;
  v_numero   integer;
  v_versao   integer := 1;
begin
  if p is null or jsonb_typeof(p) <> 'object' or v_texto is null
     or jsonb_typeof(coalesce(p -> 'valores', '{}')) <> 'object'
     or jsonb_typeof(coalesce(p -> 'variaveis', '{}')) <> 'object'
     or coalesce(p ->> 'token_hash', '') !~ '^[0-9a-f]{64}$'
     or v_validade not between 1 and 60 then
    raise exception 'CONTRATO_INVALIDO' using errcode = 'check_violation';
  end if;
  -- trava a empresa: numeração sem buracos nem repetição
  select * into v_e from public.empresas e where e.id = v_u.empresa_id for update;

  select * into v_lead from public.leads l
  where l.id = nullif(p ->> 'lead_id', '')::uuid and l.empresa_id = v_e.id;
  if v_lead.id is null or v_lead.anonimizado_em is not null then
    raise exception 'CONTRATO_LEAD_INVALIDO' using errcode = 'check_violation';
  end if;
  if nullif(p ->> 'orcamento_id', '') is not null then
    select * into v_o from public.orcamentos o
    where o.id = (p ->> 'orcamento_id')::uuid and o.empresa_id = v_e.id and o.lead_id = v_lead.id;
    if v_o.id is null then
      raise exception 'CONTRATO_ORCAMENTO_INVALIDO' using errcode = 'check_violation';
    end if;
  end if;
  if nullif(p ->> 'reserva_id', '') is not null then
    select * into v_r from public.reservas r
    where r.id = (p ->> 'reserva_id')::uuid and r.empresa_id = v_e.id
      and (r.lead_id = v_lead.id or (v_o.id is not null and r.orcamento_id = v_o.id));
    if v_r.id is null then
      raise exception 'CONTRATO_RESERVA_INVALIDA' using errcode = 'check_violation';
    end if;
  end if;
  if v_o.id is null and v_r.id is null then
    raise exception 'CONTRATO_SEM_ORIGEM' using errcode = 'check_violation';
  end if;
  if v_exige and v_email is null then
    raise exception 'CONTRATO_CODIGO_SEM_EMAIL' using errcode = 'check_violation';
  end if;

  if nullif(p ->> 'substitui_contrato_id', '') is not null then
    select * into v_ant from public.contratos c
    where c.id = (p ->> 'substitui_contrato_id')::uuid and c.empresa_id = v_e.id
      and c.lead_id = v_lead.id
    for update;
    if v_ant.id is null or v_ant.status in ('concluido', 'rascunho', 'assinado_cliente') then
      raise exception 'CONTRATO_NAO_REFAZ' using errcode = 'check_violation';
    end if;
    v_versao := v_ant.versao + 1;
    if v_ant.status <> 'cancelado' then
      update public.contratos set status = 'cancelado', cancelado_em = now(), cancelado_por = v_u.id,
        cancelamento_motivo = 'Refeito'
      where id = v_ant.id;
      insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
      values (v_e.id, v_u.id, 'contrato.cancelado', 'contrato', v_ant.id,
              jsonb_build_object('motivo', 'Refeito'));
    end if;
  end if;

  if not v_lead.eh_teste then
    v_plano := public._plano_vigente(v_e.id);
    if v_plano.contratos_mes is not null
       and public._contratos_no_mes(v_e.id) >= v_plano.contratos_mes then
      raise exception 'LIMITE_PLANO_CONTRATOS' using errcode = 'check_violation',
        detail = v_plano.contratos_mes::text;
    end if;
  end if;

  v_ano := extract(year from (now() at time zone v_e.fuso))::integer;
  select coalesce(max(c.numero), 0) + 1 into v_numero from public.contratos c
  where c.empresa_id = v_e.id and c.ano = v_ano;

  insert into public.contratos (
    empresa_id, ano, numero, versao, substitui_contrato_id, lead_id, orcamento_id, reserva_id,
    modelo_id, modelo_origem, titulo, status, texto, hash, valores, variaveis, exige_codigo,
    email_cliente, token_hash, expira_em, enviado_em, enviado_por, eh_teste, criado_por)
  values (
    v_e.id, v_ano, v_numero, v_versao, v_ant.id, v_lead.id, v_o.id, v_r.id,
    nullif(p ->> 'modelo_id', '')::uuid, nullif(p ->> 'modelo_origem', ''), btrim(p ->> 'titulo'),
    'enviado', v_texto, encode(sha256(convert_to(v_texto, 'UTF8')), 'hex'),
    coalesce(p -> 'valores', '{}'::jsonb), coalesce(p -> 'variaveis', '{}'::jsonb), v_exige,
    v_email, p ->> 'token_hash', now() + make_interval(days => v_validade), now(), v_u.id,
    v_lead.eh_teste, v_u.id)
  returning * into v_c;

  -- o buffet assina ao enviar
  insert into public.contrato_assinaturas (empresa_id, contrato_id, parte, nome, representa,
    documento_mascarado, usuario_id, ip_hash, user_agent, hash_documento, metodo, codigo_verificado)
  values (v_e.id, v_c.id, 'buffet', v_u.nome, coalesce(v_e.razao_social, v_e.nome),
          case when v_e.cnpj is not null then 'CNPJ ' || public._formatar_cnpj(v_e.cnpj) end,
          v_u.id, nullif(p ->> 'ip_hash', ''), left(nullif(p ->> 'user_agent', ''), 400),
          v_c.hash, 'aceite', false);

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_e.id, v_u.id, 'contrato.enviado', 'contrato', v_c.id,
          jsonb_build_object('ano', v_ano, 'numero', v_numero, 'versao', v_versao,
                             'lead_id', v_lead.id, 'orcamento_id', v_o.id, 'reserva_id', v_r.id,
                             'substitui', v_ant.id, 'hash', v_c.hash, 'exige_codigo', v_exige,
                             'expira_em', v_c.expira_em));
  return jsonb_build_object('id', v_c.id, 'ano', v_ano, 'numero', v_numero, 'versao', v_versao,
                            'expira_em', v_c.expira_em);
end;
$$;

/** Cancela um contrato ainda não concluído (o link para de funcionar). */
create or replace function public.cancelar_contrato(p_id uuid, p_motivo text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._contrato_dono();
  v_c public.contratos;
begin
  select * into v_c from public.contratos c
  where c.id = p_id and c.empresa_id = v_u.empresa_id for update;
  if v_c.id is null then
    raise exception 'CONTRATO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  if v_c.status = 'cancelado' then
    return false;
  end if;
  if v_c.status in ('concluido', 'assinado_cliente') then
    raise exception 'CONTRATO_CONCLUIDO' using errcode = 'check_violation';
  end if;
  update public.contratos set status = 'cancelado', cancelado_em = now(), cancelado_por = v_u.id,
    cancelamento_motivo = left(nullif(btrim(coalesce(p_motivo, '')), ''), 300)
  where id = v_c.id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'contrato.cancelado', 'contrato', v_c.id,
          jsonb_build_object('status_antes', v_c.status));
  return true;
end;
$$;

/**
 * Link novo (o anterior para de funcionar): para reenviar ou quando venceu. Só enviado ou
 * vencido. O token em si nunca fica no banco, por isso "reenviar" sempre gera outro.
 */
create or replace function public.novo_link_contrato(p_id uuid, p_token_hash text, p_validade_dias integer default 14)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._contrato_dono();
  v_c public.contratos;
begin
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' or coalesce(p_validade_dias, 0) not between 1 and 60 then
    raise exception 'CONTRATO_INVALIDO' using errcode = 'check_violation';
  end if;
  select * into v_c from public.contratos c
  where c.id = p_id and c.empresa_id = v_u.empresa_id for update;
  if v_c.id is null then
    raise exception 'CONTRATO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  if v_c.status not in ('enviado', 'expirado') then
    raise exception 'CONTRATO_SEM_LINK' using errcode = 'check_violation';
  end if;
  update public.contratos set token_hash = p_token_hash, status = 'enviado',
    expira_em = now() + make_interval(days => p_validade_dias)
  where id = v_c.id
  returning * into v_c;
  update public.contrato_codigos set usado_em = coalesce(usado_em, now()) where contrato_id = v_c.id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'contrato.link_novo', 'contrato', v_c.id,
          jsonb_build_object('expira_em', v_c.expira_em));
  return v_c.expira_em;
end;
$$;

/** CPF cifrado do cliente (o servidor decifra para o dono ver completo). Fica na auditoria. */
create or replace function public.ler_cpf_contrato(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u   public.usuarios := public._contrato_dono();
  v_doc text;
begin
  perform set_config('orkestra.permitir_escrita', '1', true);
  select a.documento_cifrado into v_doc from public.contrato_assinaturas a
  join public.contratos c on c.id = a.contrato_id
  where a.contrato_id = p_id and a.parte = 'cliente' and c.empresa_id = v_u.empresa_id;
  if v_doc is null then
    raise exception 'CONTRATO_SEM_CPF' using errcode = 'no_data_found';
  end if;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'contrato.cpf_visto', 'contrato', p_id, '{}'::jsonb);
  return v_doc;
end;
$$;

/** O PDF final foi guardado no Storage (caminho fixo: {empresa_id}/{contrato_id}.pdf). */
create or replace function public.contrato_marcar_pdf(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._contrato_dono();
begin
  perform set_config('orkestra.permitir_escrita', '1', true);
  update public.contratos set pdf_gerado_em = now()
  where id = p_id and empresa_id = v_u.empresa_id and status = 'concluido' and pdf_gerado_em is null
    and anonimizado_em is null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Link do cliente (schema publico, só anon, chamado pelo servidor)
-- ---------------------------------------------------------------------------------------------

/** Limite por IP e por contrato numa janela de 1 hora (mesma técnica de publico._limitar). */
create or replace function publico._limitar_contrato(
  p_acao text, p_empresa uuid, p_contrato uuid, p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lim_ip  integer;
  v_lim_ctr integer;
  v_ip      text := coalesce(nullif(btrim(coalesce(p_ip_hash, '')), ''), 'sem-ip');
  v_total   integer;
begin
  select l.ip, l.ctr into v_lim_ip, v_lim_ctr
  from (values
    ('contrato_abrir',   120, 300),
    ('contrato_codigo',   10,   5),
    ('contrato_assinar',  20,  15),
    ('contrato_recusar',   5,   3),
    ('contrato_pdf',      30,  30)
  ) as l(acao, ip, ctr)
  where l.acao = p_acao;
  if v_lim_ip is null or char_length(v_ip) > 128 then
    raise exception 'PUBLICO_ACAO_INVALIDA' using errcode = 'invalid_parameter_value';
  end if;
  select count(*) into v_total from publico.tentativas t
  where t.acao = p_acao and t.chave_tipo = 'ip' and t.chave_hash = v_ip
    and t.criado_em > now() - interval '1 hour';
  if v_total >= v_lim_ip then
    return false;
  end if;
  select count(*) into v_total from publico.tentativas t
  where t.acao = p_acao and t.chave_tipo = 'contrato' and t.chave_hash = p_contrato::text
    and t.criado_em > now() - interval '1 hour';
  if v_total >= v_lim_ctr then
    return false;
  end if;
  insert into publico.tentativas (acao, chave_tipo, chave_hash, empresa_id)
  values (p_acao, 'ip', v_ip, p_empresa), (p_acao, 'contrato', p_contrato::text, p_empresa);
  return true;
end;
$$;

/**
 * Contrato pelo token, só dentro do buffet do slug (o token de um buffet nunca abre nada no
 * outro). Linha vazia se não achar. Enviado e vencido vira "expirado" aqui (antes do job).
 */
create or replace function publico._contrato(p_slug text, p_token text, p_travar boolean default false)
returns public.contratos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.empresas;
  v_c public.contratos;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return v_c;
  end if;
  v_e := publico._empresa(p_slug);
  if v_e.id is null then
    return v_c;
  end if;
  if p_travar then
    select * into v_c from public.contratos c
    where c.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and c.empresa_id = v_e.id
    for update;
  else
    select * into v_c from public.contratos c
    where c.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and c.empresa_id = v_e.id;
  end if;
  if v_c.id is not null and v_c.status = 'enviado' and v_c.expira_em <= now() then
    update public.contratos set status = 'expirado' where id = v_c.id returning * into v_c;
    insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
    values (v_c.empresa_id, null, 'contrato.expirado', 'contrato', v_c.id, '{}'::jsonb);
  end if;
  return v_c;
end;
$$;

/**
 * O que a página do cliente mostra. Token inexistente, de outro buffet, vencido, cancelado ou
 * anonimizado: a MESMA resposta ({estado: indisponivel}), sem nenhum dado.
 */
create or replace function publico.contrato(p_slug text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c  public.contratos;
  v_e  public.empresas;
  v_b  public.contrato_assinaturas;
  v_cl public.contrato_assinaturas;
begin
  v_c := publico._contrato(p_slug, p_token);
  if v_c.id is null or v_c.anonimizado_em is not null
     or v_c.status not in ('enviado', 'concluido', 'recusado') then
    return jsonb_build_object('estado', 'indisponivel');
  end if;
  select * into v_e from public.empresas e where e.id = v_c.empresa_id;
  if v_c.status = 'recusado' then
    return jsonb_build_object('estado', 'recusado', 'buffet', v_e.nome);
  end if;
  select * into v_b from public.contrato_assinaturas a where a.contrato_id = v_c.id and a.parte = 'buffet';
  select * into v_cl from public.contrato_assinaturas a where a.contrato_id = v_c.id and a.parte = 'cliente';
  if v_c.status = 'concluido' then
    return jsonb_build_object('estado', 'concluido', 'buffet', v_e.nome,
      'ano', v_c.ano, 'numero', v_c.numero, 'versao', v_c.versao, 'titulo', v_c.titulo,
      'concluido_em', v_c.concluido_em, 'cliente_nome', v_cl.nome, 'eh_teste', v_c.eh_teste);
  end if;
  return jsonb_build_object(
    'estado', 'aberto',
    'buffet', v_e.nome,
    'ano', v_c.ano, 'numero', v_c.numero, 'versao', v_c.versao, 'titulo', v_c.titulo,
    'texto', v_c.texto, 'hash', v_c.hash, 'valores', v_c.valores,
    'exige_codigo', v_c.exige_codigo,
    'email_mascarado', case when v_c.email_cliente is not null
      then left(v_c.email_cliente, 1) || '***@' || split_part(v_c.email_cliente, '@', 2) end,
    'enviado_em', v_c.enviado_em, 'expira_em', v_c.expira_em, 'eh_teste', v_c.eh_teste,
    'fuso', v_e.fuso,
    'buffet_assinatura', jsonb_build_object('nome', v_b.nome, 'representa', v_b.representa,
                                            'assinado_em', v_b.assinado_em)
  );
end;
$$;

/** Cliente abriu o link (o próprio usuário da empresa não conta). Excesso: ignorado. */
create or replace function publico.contrato_visualizar(
  p_slug text, p_token text, p_eh_usuario_empresa boolean, p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.contratos;
begin
  if coalesce(p_eh_usuario_empresa, false) then
    return;
  end if;
  v_c := publico._contrato(p_slug, p_token, true);
  if v_c.id is null or v_c.status <> 'enviado' then
    return;
  end if;
  if not publico._limitar_contrato('contrato_abrir', v_c.empresa_id, v_c.id, p_ip_hash) then
    return;
  end if;
  if v_c.visualizado_em is null then
    update public.contratos set visualizado_em = now() where id = v_c.id;
  end if;
  if not exists (select 1 from public.auditoria a
                 where a.entidade_id = v_c.id and a.acao = 'contrato.visualizado'
                   and a.criado_em > now() - interval '30 minutes') then
    insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
    values (v_c.empresa_id, null, 'contrato.visualizado', 'contrato', v_c.id,
            jsonb_build_object('primeira', v_c.visualizado_em is null));
  end if;
end;
$$;

/**
 * Pede um código de 6 dígitos (o servidor gera, manda por e-mail e guarda só o hash aqui).
 * O código anterior deixa de valer. Devolve o e-mail (só para o servidor enviar) ou o motivo.
 */
create or replace function publico.contrato_pedir_codigo(
  p_slug text, p_token text, p_codigo_hash text, p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c  public.contratos;
  v_id uuid;
begin
  if coalesce(p_codigo_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'PUBLICO_ACAO_INVALIDA' using errcode = 'invalid_parameter_value';
  end if;
  v_c := publico._contrato(p_slug, p_token, true);
  if v_c.id is null or v_c.status <> 'enviado' or v_c.anonimizado_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'INDISPONIVEL');
  end if;
  if not v_c.exige_codigo or v_c.email_cliente is null then
    return jsonb_build_object('ok', false, 'codigo', 'SEM_CODIGO');
  end if;
  if not publico._limitar_contrato('contrato_codigo', v_c.empresa_id, v_c.id, p_ip_hash) then
    return jsonb_build_object('ok', false, 'codigo', 'LIMITE');
  end if;
  update public.contrato_codigos set usado_em = now()
  where contrato_id = v_c.id and usado_em is null;
  insert into public.contrato_codigos (empresa_id, contrato_id, codigo_hash, expira_em)
  values (v_c.empresa_id, v_c.id, p_codigo_hash, now() + interval '10 minutes')
  returning id into v_id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_c.empresa_id, null, 'contrato.codigo_pedido', 'contrato', v_c.id, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'codigo_id', v_id, 'contrato_id', v_c.id,
    'email', v_c.email_cliente,
    'buffet', (select e.nome from public.empresas e where e.id = v_c.empresa_id),
    'ano', v_c.ano, 'numero', v_c.numero);
end;
$$;

/**
 * Assinatura do cliente. p: nome, documento_cifrado, documento_mascarado, hash (o texto que a
 * pessoa viu), codigo_hash?, ip_hash?, user_agent?, eh_usuario_empresa. Erros esperados voltam
 * como {ok: false, codigo} (a tentativa errada de código fica gravada).
 */
create or replace function publico.contrato_assinar(p_slug text, p_token text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c      public.contratos;
  v_cod    public.contrato_codigos;
  v_nome   text := regexp_replace(btrim(coalesce(p ->> 'nome', '')), '\s+', ' ', 'g');
  v_metodo public.metodo_assinatura := 'aceite';
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PUBLICO_ACAO_INVALIDA' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce((p ->> 'eh_usuario_empresa')::boolean, false) then
    return jsonb_build_object('ok', false, 'codigo', 'MODO_TESTE');
  end if;
  v_c := publico._contrato(p_slug, p_token, true);
  if v_c.id is null or v_c.anonimizado_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'INDISPONIVEL');
  end if;
  if v_c.status = 'concluido' then
    return jsonb_build_object('ok', false, 'codigo', 'JA_ASSINADO');
  end if;
  if v_c.status <> 'enviado' then
    return jsonb_build_object('ok', false, 'codigo', 'INDISPONIVEL');
  end if;
  if not publico._limitar_contrato('contrato_assinar', v_c.empresa_id, v_c.id, p ->> 'ip_hash') then
    return jsonb_build_object('ok', false, 'codigo', 'LIMITE');
  end if;
  if coalesce(p ->> 'hash', '') <> v_c.hash then
    return jsonb_build_object('ok', false, 'codigo', 'CONTRATO_MUDOU');
  end if;
  if char_length(v_nome) not between 5 and 120
     or array_length(regexp_split_to_array(v_nome, ' '), 1) < 2
     or coalesce(p ->> 'documento_cifrado', '') !~ '^v1:[A-Za-z0-9_-]+$'
     or char_length(p ->> 'documento_cifrado') not between 24 and 404
     or coalesce(p ->> 'documento_mascarado', '') !~ '^\*\*\*\.[0-9]{3}\.[0-9]{3}-\*\*$'
     or coalesce(p ->> 'ip_hash', '') !~ '^([0-9a-f]{64})?$' then
    return jsonb_build_object('ok', false, 'codigo', 'DADOS_INVALIDOS');
  end if;

  if v_c.exige_codigo then
    select * into v_cod from public.contrato_codigos k
    where k.contrato_id = v_c.id and k.usado_em is null
    order by k.criado_em desc limit 1
    for update;
    if v_cod.id is null then
      return jsonb_build_object('ok', false, 'codigo', 'CODIGO_PEDIR');
    end if;
    if v_cod.expira_em <= now() then
      return jsonb_build_object('ok', false, 'codigo', 'CODIGO_EXPIRADO');
    end if;
    if v_cod.tentativas >= 5 then
      return jsonb_build_object('ok', false, 'codigo', 'CODIGO_BLOQUEADO');
    end if;
    if coalesce(p ->> 'codigo_hash', '') <> v_cod.codigo_hash then
      update public.contrato_codigos set tentativas = tentativas + 1 where id = v_cod.id;
      return jsonb_build_object('ok', false,
        'codigo', case when v_cod.tentativas + 1 >= 5 then 'CODIGO_BLOQUEADO' else 'CODIGO_INVALIDO' end,
        'restantes', greatest(0, 4 - v_cod.tentativas));
    end if;
    update public.contrato_codigos set usado_em = now() where id = v_cod.id;
    v_metodo := 'aceite_com_codigo';
  end if;

  insert into public.contrato_assinaturas (empresa_id, contrato_id, parte, nome, documento_cifrado,
    documento_mascarado, ip_hash, user_agent, hash_documento, metodo, codigo_verificado)
  values (v_c.empresa_id, v_c.id, 'cliente', v_nome, p ->> 'documento_cifrado',
          p ->> 'documento_mascarado', nullif(p ->> 'ip_hash', ''),
          left(nullif(p ->> 'user_agent', ''), 400), v_c.hash, v_metodo, v_c.exige_codigo);
  update public.contratos set status = 'concluido', concluido_em = now() where id = v_c.id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_c.empresa_id, null, 'contrato.assinado', 'contrato', v_c.id,
          jsonb_build_object('parte', 'cliente', 'metodo', v_metodo, 'hash', v_c.hash));
  return jsonb_build_object('ok', true);
end;
$$;

/** "Não concordo / Pedir ajuste": grava a recusa (com motivo opcional) e o dono é avisado. */
create or replace function publico.contrato_recusar(
  p_slug text, p_token text, p_motivo text, p_ip_hash text, p_eh_usuario_empresa boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.contratos;
begin
  if coalesce(p_eh_usuario_empresa, false) then
    return jsonb_build_object('ok', false, 'codigo', 'MODO_TESTE');
  end if;
  v_c := publico._contrato(p_slug, p_token, true);
  if v_c.id is null or v_c.status <> 'enviado' or v_c.anonimizado_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'INDISPONIVEL');
  end if;
  if not publico._limitar_contrato('contrato_recusar', v_c.empresa_id, v_c.id, p_ip_hash) then
    return jsonb_build_object('ok', false, 'codigo', 'LIMITE');
  end if;
  update public.contratos set status = 'recusado', recusado_em = now(),
    recusa_motivo = left(nullif(btrim(coalesce(p_motivo, '')), ''), 500)
  where id = v_c.id;
  update public.contrato_codigos set usado_em = coalesce(usado_em, now()) where contrato_id = v_c.id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_c.empresa_id, null, 'contrato.recusado', 'contrato', v_c.id,
          jsonb_build_object('com_motivo', nullif(btrim(coalesce(p_motivo, '')), '') is not null));
  return jsonb_build_object('ok', true);
end;
$$;

/**
 * Dados do PDF final (só contrato concluído): texto, hash e as duas assinaturas, sem o CPF
 * cifrado. Com limite por IP e por contrato (mesma regra do PDF da proposta).
 */
create or replace function publico.contrato_comprovante(p_slug text, p_token text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.contratos;
begin
  v_c := publico._contrato(p_slug, p_token);
  if v_c.id is null or v_c.status <> 'concluido' or v_c.anonimizado_em is not null then
    return null;
  end if;
  if not publico._limitar_contrato('contrato_pdf', v_c.empresa_id, v_c.id, p_ip_hash) then
    return jsonb_build_object('limite', true);
  end if;
  return public._contrato_comprovante(v_c.id);
end;
$$;

/** O servidor guardou o PDF final no Storage (caminho fixo {empresa_id}/{contrato_id}.pdf). */
create or replace function publico.contrato_marcar_pdf(p_slug text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.contratos;
begin
  v_c := publico._contrato(p_slug, p_token, true);
  if v_c.id is not null and v_c.status = 'concluido' and v_c.pdf_gerado_em is null
     and v_c.anonimizado_em is null then
    update public.contratos set pdf_gerado_em = now() where id = v_c.id;
  end if;
end;
$$;

/** Núcleo do comprovante (link público e painel). */
create or replace function public._contrato_comprovante(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'empresa_id', c.empresa_id, 'ano', c.ano, 'numero', c.numero,
    'versao', c.versao, 'titulo', c.titulo, 'texto', c.texto, 'hash', c.hash,
    'enviado_em', c.enviado_em, 'concluido_em', c.concluido_em, 'eh_teste', c.eh_teste,
    'pdf_gerado_em', c.pdf_gerado_em, 'fuso', e.fuso,
    'assinaturas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'parte', a.parte, 'nome', a.nome, 'representa', a.representa,
        'documento', a.documento_mascarado, 'assinado_em', a.assinado_em,
        'ip', left(a.ip_hash, 16), 'metodo', a.metodo, 'codigo_verificado', a.codigo_verificado,
        'hash_documento', a.hash_documento) order by a.parte)
      from public.contrato_assinaturas a where a.contrato_id = c.id), '[]'::jsonb))
  from public.contratos c join public.empresas e on e.id = c.empresa_id
  where c.id = p_id;
$$;

/** Painel: comprovante pelo id (dono). Leitura com a mesma regra do RLS. */
create or replace function public.contrato_comprovante(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._contrato_dono();
begin
  if not exists (select 1 from public.contratos c where c.id = p_id and c.empresa_id = v_u.empresa_id
                 and c.status = 'concluido') then
    return null;
  end if;
  return public._contrato_comprovante(p_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. LGPD
-- ---------------------------------------------------------------------------------------------

/**
 * Anonimiza um contrato: texto, variáveis e motivos passam pela mesma redação do lead
 * ("Titular removido"); e-mail, códigos e dados da assinatura do cliente somem. O hash fica (é
 * do texto original e marca que houve um contrato), por isso a página e o PDF param de abrir.
 */
create or replace function public._contrato_anonimizar(p_id uuid, p_termos text[], p_digitos text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.contratos;
  v_termos text[];
begin
  select * into v_c from public.contratos c where c.id = p_id for update;
  if v_c.id is null or v_c.anonimizado_em is not null then
    return;
  end if;
  perform set_config('orkestra.lgpd', '1', true);
  perform set_config('orkestra.permitir_escrita', '1', true);
  -- termos do próprio contrato (nome e e-mail que estavam nele) além dos do lead
  select array_agg(distinct t) into v_termos from (
    select lower(btrim(x)) as t from unnest(coalesce(p_termos, '{}') || array[
      v_c.variaveis ->> 'cliente_nome', v_c.email_cliente,
      split_part(coalesce(v_c.email_cliente, ''), '@', 1)]) x
    union all
    select lower(w) from regexp_split_to_table(coalesce(v_c.variaveis ->> 'cliente_nome', ''), '\s+') w
    union all
    select lower(btrim(a.nome)) from public.contrato_assinaturas a
    where a.contrato_id = v_c.id and a.parte = 'cliente'
    union all
    select lower(w) from public.contrato_assinaturas a, regexp_split_to_table(a.nome, '\s+') w
    where a.contrato_id = v_c.id and a.parte = 'cliente'
  ) s where t is not null and char_length(t) >= 3 and t <> 'titular removido';
  v_termos := coalesce(v_termos, '{}');

  update public.contratos set
    texto = (select string_agg(public._lgpd_redigir_texto(l, v_termos, p_digitos), E'\n' order by n)
             from regexp_split_to_table(texto, E'\n') with ordinality as x(l, n)),
    variaveis = public._lgpd_redigir_jsonb(variaveis, v_termos, p_digitos),
    valores = public._lgpd_redigir_jsonb(valores, v_termos, p_digitos),
    email_cliente = null,
    recusa_motivo = null,
    cancelamento_motivo = case when cancelamento_motivo is null then null
                               else public._lgpd_redigir_texto(cancelamento_motivo, v_termos, p_digitos) end,
    anonimizado_em = now()
  where id = v_c.id;
  update public.contrato_assinaturas set nome = 'Titular removido', documento_cifrado = null,
    documento_mascarado = null, ip_hash = null, user_agent = null, anonimizado_em = now()
  where contrato_id = v_c.id and parte = 'cliente';
  delete from public.contrato_codigos where contrato_id = v_c.id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_c.empresa_id, auth.uid(), 'contrato.anonimizado', 'contrato', v_c.id,
          jsonb_build_object('status', v_c.status));
  -- a liberação vale só para esta anonimização, não para o resto da transação
  perform set_config('orkestra.lgpd', '', true);
end;
$$;

/**
 * Lead anonimizado (pedido do titular ou retenção): contratos NÃO concluídos dele são
 * anonimizados junto. Contrato concluído fica inteiro (prova do buffet; obrigação de guarda)
 * até 5 anos depois da festa (job contratos_rotina).
 */
create or replace function public._lead_anonimizado_contratos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_termos  text[];
  v_digitos text := right(regexp_replace(coalesce(old.whatsapp_e164, ''), '\D', '', 'g'), 8);
begin
  select array_agg(distinct t) into v_termos from (
    select lower(btrim(x)) as t
    from unnest(array[old.nome, old.email, split_part(coalesce(old.email, ''), '@', 1)]) x
    union all
    select lower(w) from regexp_split_to_table(coalesce(old.nome, ''), '\s+') w
  ) s where t is not null and char_length(t) >= 3 and t <> 'titular removido';
  for v_id in
    select c.id from public.contratos c
    where c.lead_id = new.id and c.status <> 'concluido' and c.anonimizado_em is null
  loop
    perform public._contrato_anonimizar(v_id, coalesce(v_termos, '{}'), v_digitos);
  end loop;
  return null;
end;
$$;

create trigger leads_anonimizado_contratos
  after update of anonimizado_em on public.leads
  for each row when (old.anonimizado_em is null and new.anonimizado_em is not null)
  execute function public._lead_anonimizado_contratos();

/**
 * Rotina diária: (1) link vencido vira "expirado"; (2) contrato concluído há mais de 5 anos da
 * data da festa (ou da conclusão, sem data) é anonimizado; (3) códigos com mais de 1 dia somem.
 */
create or replace function public.contratos_rotina(p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r       record;
  v_exp     integer := 0;
  v_anon    integer := 0;
  v_codigos integer;
begin
  for v_r in
    select c.id, c.empresa_id from public.contratos c
    where c.status = 'enviado' and c.expira_em <= p_agora
    limit 2000
  loop
    update public.contratos set status = 'expirado' where id = v_r.id;
    insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
    values (v_r.empresa_id, null, 'contrato.expirado', 'contrato', v_r.id, '{}'::jsonb);
    v_exp := v_exp + 1;
  end loop;

  for v_r in
    select c.id, l.whatsapp_e164 from public.contratos c
    join public.leads l on l.id = c.lead_id
    where c.status = 'concluido' and c.anonimizado_em is null
      and coalesce(nullif(c.valores ->> 'data', '')::date, (c.concluido_em at time zone 'UTC')::date)
          < (p_agora - interval '5 years')::date
    limit 500
  loop
    perform public._contrato_anonimizar(v_r.id, '{}',
      right(regexp_replace(coalesce(v_r.whatsapp_e164, ''), '\D', '', 'g'), 8));
    v_anon := v_anon + 1;
  end loop;

  delete from public.contrato_codigos k where k.criado_em < p_agora - interval '1 day';
  get diagnostics v_codigos = row_count;
  return jsonb_build_object('expirados', v_exp, 'anonimizados', v_anon, 'codigos', v_codigos);
end;
$$;

/** PDFs de contratos anonimizados que ainda estão no Storage (o servidor apaga). */
create or replace function public.contratos_pdfs_a_remover()
returns table (empresa_id uuid, contrato_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.empresa_id, c.id from public.contratos c
  where c.anonimizado_em is not null and c.pdf_gerado_em is not null
  limit 500;
$$;

create or replace function public.contrato_pdf_removido(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('orkestra.lgpd', '1', true);
  update public.contratos set pdf_gerado_em = null where id = p_id and anonimizado_em is not null;
  perform set_config('orkestra.lgpd', '', true);
end;
$$;

/**
 * Exportação do lead (pedido do titular) agora com os contratos: texto, status, datas e as
 * assinaturas com o CPF mascarado (nunca o cifrado nem o token).
 */
create or replace function public.lgpd_exportar_lead(p_lead uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := public._lgpd_exigir_dono();
  v_lead    public.leads%rowtype;
  v_saida   jsonb;
begin
  perform set_config('orkestra.permitir_escrita', '1', true);
  select * into v_lead from public.leads l where l.id = p_lead and l.empresa_id = v_empresa;
  if v_lead.id is null then
    raise exception 'LEAD_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  v_saida := jsonb_build_object(
    'exportado_em', now(),
    'lead', (select to_jsonb(l) - 'empresa_id' - 'responsavel_id' - 'titular_hash'
             from public.leads l where l.id = p_lead),
    'orcamentos', coalesce((
      select jsonb_agg((to_jsonb(o) - 'empresa_id' - 'criado_por' - 'rascunho')
                       || jsonb_build_object('itens', coalesce((
                            select jsonb_agg(to_jsonb(i) - 'empresa_id' - 'orcamento_id' order by i.ordem)
                            from public.orcamento_itens i where i.orcamento_id = o.id), '[]'::jsonb))
                       order by o.numero, o.versao)
      from public.orcamentos o where o.lead_id = p_lead and o.empresa_id = v_empresa), '[]'::jsonb),
    'atividades', coalesce((
      select jsonb_agg(to_jsonb(a) - 'empresa_id' - 'lead_id' - 'usuario_id' order by a.criado_em)
      from public.atividades a where a.lead_id = p_lead and a.empresa_id = v_empresa), '[]'::jsonb),
    'visitas', coalesce((
      select jsonb_agg(to_jsonb(v) - 'empresa_id' - 'lead_id' - 'confirmada_por' - 'criado_por'
                       order by v.criado_em)
      from public.visitas v where v.lead_id = p_lead and v.empresa_id = v_empresa), '[]'::jsonb),
    'reservas', coalesce((
      select jsonb_agg(to_jsonb(r) - 'empresa_id' - 'lead_id' - 'criado_por' - 'confirmada_por'
                       - 'cancelada_por' order by r.data)
      from public.reservas r
      where r.empresa_id = v_empresa
        and (r.lead_id = p_lead or r.orcamento_id in (select o.id from public.orcamentos o
                                                     where o.lead_id = p_lead))), '[]'::jsonb),
    'notas', coalesce((
      select jsonb_agg(jsonb_build_object('texto', n.texto, 'criado_em', n.criado_em) order by n.criado_em)
      from public.notas n where n.lead_id = p_lead and n.empresa_id = v_empresa), '[]'::jsonb),
    'tarefas', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', t.titulo, 'descricao', t.descricao,
                                          'vence_em', t.vence_em, 'feita_em', t.feita_em,
                                          'cancelada_em', t.cancelada_em) order by t.criado_em)
      from public.tarefas t where t.lead_id = p_lead and t.empresa_id = v_empresa), '[]'::jsonb),
    'contratos', coalesce((
      select jsonb_agg(jsonb_build_object(
          'numero', c.ano || '-' || lpad(c.numero::text, 4, '0'), 'versao', c.versao,
          'titulo', c.titulo, 'status', c.status, 'texto', c.texto, 'hash', c.hash,
          'enviado_em', c.enviado_em, 'concluido_em', c.concluido_em,
          'recusado_em', c.recusado_em, 'cancelado_em', c.cancelado_em,
          'assinaturas', coalesce((
            select jsonb_agg(jsonb_build_object('parte', a.parte, 'nome', a.nome,
                                                'documento', a.documento_mascarado,
                                                'assinado_em', a.assinado_em, 'metodo', a.metodo)
                             order by a.parte)
            from public.contrato_assinaturas a where a.contrato_id = c.id), '[]'::jsonb))
        order by c.ano, c.numero)
      from public.contratos c where c.lead_id = p_lead and c.empresa_id = v_empresa), '[]'::jsonb)
  );

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_empresa, auth.uid(), 'lead.exportado', 'lead', p_lead, '{}'::jsonb);
  return v_saida;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 8. Storage: bucket privado "contratos" (só o servidor, com a service role, lê e grava)
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Storage indisponível: bucket contratos não criado.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('contratos', 'contratos', false, 5242880, array['application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = 5242880,
    allowed_mime_types = array['application/pdf'];
end;
$$;
-- Nenhuma policy em storage.objects para este bucket: anon e authenticated não leem nem gravam.

-- ---------------------------------------------------------------------------------------------
-- 9. Job diário
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponível: rotina dos contratos não agendada.';
    return;
  end if;
  create extension if not exists pg_cron;
  perform cron.schedule('orkestra-contratos', '30 6 * * *', 'select public.contratos_rotina()');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 10. Permissões
-- ---------------------------------------------------------------------------------------------

revoke all on function public._contrato_imutavel() from public, anon, authenticated;
revoke all on function public._contrato_assinatura_imutavel() from public, anon, authenticated;
revoke all on function public._contrato_dono() from public, anon, authenticated;
revoke all on function public._formatar_cnpj(text) from public, anon, authenticated;
revoke all on function public._contratos_no_mes(uuid) from public, anon, authenticated;
revoke all on function public._contrato_comprovante(uuid) from public, anon, authenticated;
revoke all on function public._contrato_anonimizar(uuid, text[], text) from public, anon, authenticated;
revoke all on function public._lead_anonimizado_contratos() from public, anon, authenticated;
revoke all on function public.contratos_rotina(timestamptz) from public, anon, authenticated;
grant execute on function public.contratos_rotina(timestamptz) to service_role;
revoke all on function public.contratos_pdfs_a_remover() from public, anon, authenticated;
grant execute on function public.contratos_pdfs_a_remover() to service_role;
revoke all on function public.contrato_pdf_removido(uuid) from public, anon, authenticated;
grant execute on function public.contrato_pdf_removido(uuid) to service_role;
revoke all on function public.lgpd_exportar_lead(uuid) from public, anon;
grant execute on function public.lgpd_exportar_lead(uuid) to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.salvar_contrato_modelo(jsonb)', 'public.emitir_contrato(jsonb)',
    'public.cancelar_contrato(uuid, text)', 'public.novo_link_contrato(uuid, text, integer)',
    'public.ler_cpf_contrato(uuid)', 'public.contrato_marcar_pdf(uuid)',
    'public.contrato_comprovante(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  foreach f in array array[
    'publico._limitar_contrato(text, uuid, uuid, text)', 'publico._contrato(text, text, boolean)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  foreach f in array array[
    'publico.contrato(text, text)', 'publico.contrato_visualizar(text, text, boolean, text)',
    'publico.contrato_pedir_codigo(text, text, text, text)', 'publico.contrato_assinar(text, text, jsonb)',
    'publico.contrato_recusar(text, text, text, text, boolean)',
    'publico.contrato_comprovante(text, text, text)', 'publico.contrato_marcar_pdf(text, text)'] loop
    execute format('revoke all on function %s from public, authenticated', f);
    execute format('grant execute on function %s to anon', f);
  end loop;
end;
$$;
