-- Etapa 9.5 · PR 2 · Página pública do buffet (Parte E).
-- Tudo aditivo: colunas novas (nullable ou com default) em empresas, três tabelas novas, funções
-- de escrita (security definer, só dono, com auditoria) e a leitura pública publico.pagina.
-- O código anterior não usa nada disto.

-- ---------------------------------------------------------------------------
-- 1. Estilo e colunas novas em empresas
-- ---------------------------------------------------------------------------

create type public.estilo_pagina as enum ('festivo', 'elegante', 'limpo');

/** Diferenciais: até 8, cada um com 2 a 40 caracteres, sem repetir. Espelho: domain/publico/pagina. */
create or replace function public._diferenciais_validos(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p), 0) <= 8
     and not exists (select 1 from unnest(p) d where d is null or char_length(btrim(d)) not between 2 and 40)
     and (select count(distinct lower(btrim(d))) from unnest(p) d) = coalesce(cardinality(p), 0);
$$;

alter table public.empresas
  add column if not exists slogan text,
  add column if not exists estilo public.estilo_pagina,
  add column if not exists diferenciais text[] not null default '{}',
  add column if not exists bairro text,
  add column if not exists mostrar_endereco boolean not null default false,
  add column if not exists pagina_personalizada_em timestamptz;

alter table public.empresas
  add constraint empresas_slogan_tamanho check (slogan is null or char_length(slogan) between 1 and 80),
  add constraint empresas_bairro_tamanho check (bairro is null or char_length(bairro) between 1 and 80),
  add constraint empresas_diferenciais_validos check (public._diferenciais_validos(diferenciais));

comment on column public.empresas.estilo is
  'Estilo da página pública. Null = padrão do segmento (infantil festivo, eventos elegante, domicílio limpo).';
comment on column public.empresas.pagina_personalizada_em is
  'Primeira vez que o dono salvou algo no editor da página (item opcional do checklist).';

-- ---------------------------------------------------------------------------
-- 2. Tabelas: galeria, depoimentos e perguntas frequentes
-- ---------------------------------------------------------------------------

create table public.galeria_fotos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  -- {empresa_id}/galeria/{uuid}-640.webp e -1280.webp (o navegador gera as duas larguras)
  caminho_640  text not null check (caminho_640 ~ '^[0-9a-f-]{36}/galeria/[0-9a-f-]{36}-640\.webp$'),
  caminho_1280 text not null check (caminho_1280 ~ '^[0-9a-f-]{36}/galeria/[0-9a-f-]{36}-1280\.webp$'),
  largura      integer not null check (largura between 1 and 4000),
  altura       integer not null check (altura between 1 and 4000),
  -- miniatura desfocada (data URL WEBP de ~16 px) para o placeholder
  blur         text check (blur is null or (char_length(blur) <= 2000 and blur like 'data:image/%')),
  alt          text check (alt is null or char_length(alt) between 1 and 140),
  ordem        smallint not null default 0 check (ordem between 0 and 99),
  criado_em    timestamptz not null default now(),
  unique (id, empresa_id),
  check (split_part(caminho_640, '/', 1) = empresa_id::text),
  check (split_part(caminho_1280, '/', 1) = empresa_id::text)
);
create index galeria_fotos_empresa_id_fk_idx on public.galeria_fotos (empresa_id, ordem);

create table public.depoimentos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  nome        text not null check (char_length(btrim(nome)) between 2 and 60),
  tipo_festa  text check (tipo_festa is null or char_length(btrim(tipo_festa)) between 2 and 60),
  texto       text not null check (char_length(btrim(texto)) between 10 and 400),
  ordem       smallint not null default 0 check (ordem between 0 and 99),
  criado_em   timestamptz not null default now(),
  unique (id, empresa_id)
);
create index depoimentos_empresa_id_fk_idx on public.depoimentos (empresa_id, ordem);

create table public.perguntas_frequentes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  pergunta    text not null check (char_length(btrim(pergunta)) between 5 and 140),
  resposta    text not null check (char_length(btrim(resposta)) between 2 and 600),
  ordem       smallint not null default 0 check (ordem between 0 and 99),
  criado_em   timestamptz not null default now(),
  unique (id, empresa_id)
);
create index perguntas_frequentes_empresa_id_fk_idx on public.perguntas_frequentes (empresa_id, ordem);

comment on table public.galeria_fotos is 'Fotos do espaço na página pública (até 12). Escrita só por salvar_galeria.';
comment on table public.depoimentos is 'Depoimentos cadastrados pelo dono (até 6). Nunca gerados pelo sistema.';
comment on table public.perguntas_frequentes is 'Perguntas do dono (até 8), além das automáticas.';

/** Limite por empresa (12 fotos, 6 depoimentos, 8 perguntas). Espelho: domain/publico/pagina. */
create or replace function public._limite_pagina()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite integer := case tg_table_name
    when 'galeria_fotos' then 12 when 'depoimentos' then 6 else 8 end;
  v_total integer;
begin
  perform 1 from public.empresas where id = new.empresa_id for update;
  execute format('select count(*) from public.%I where empresa_id = $1', tg_table_name)
    into v_total using new.empresa_id;
  if v_total >= v_limite then
    raise exception 'PAGINA_LIMITE' using errcode = 'check_violation',
      detail = tg_table_name || ':' || v_limite;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['galeria_fotos', 'depoimentos', 'perguntas_frequentes'] loop
    execute format('create trigger %I before insert on public.%I '
                   'for each row execute function public._limite_pagina()', t || '_limite', t);
    -- conta suspensa = somente leitura (mesma regra das outras tabelas com empresa_id)
    execute format('create trigger %I before insert or update or delete on public.%I '
                   'for each row execute function public._exigir_escrita()', t || '_somente_leitura', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    -- o painel só lê (o dono); escrita só pelas funções salvar_*
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (empresa_id = (select public.empresa_do_usuario())
                and (select public.perfil_do_usuario()) = ''dono'')',
      t || '_select_dono', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Escrita: só o dono, por funções, com auditoria
-- ---------------------------------------------------------------------------

create or replace function public._pagina_dono()
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
    raise exception 'PAGINA_SO_DONO' using errcode = 'insufficient_privilege';
  end if;
  return v;
end;
$$;

create or replace function public._texto_ou_nulo(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(coalesce(p, '')), '');
$$;

/**
 * Textos da página: {slogan, estilo, diferenciais[], bairro, endereco, mostrar_endereco}.
 * Campo ausente = sem mudança. Estilo null = padrão do segmento.
 */
create or replace function public.salvar_pagina_publica(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u      public.usuarios := public._pagina_dono();
  v_e      public.empresas;
  v_dif    text[];
  v_antes  jsonb;
  v_depois jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PAGINA_INVALIDA' using errcode = 'check_violation';
  end if;
  select * into v_e from public.empresas where id = v_u.empresa_id for update;
  if p ? 'diferenciais' then
    if jsonb_typeof(p -> 'diferenciais') <> 'array' then
      raise exception 'PAGINA_INVALIDA' using errcode = 'check_violation';
    end if;
    select coalesce(array_agg(btrim(d) order by n), '{}') into v_dif
    from jsonb_array_elements_text(p -> 'diferenciais') with ordinality as x(d, n)
    where btrim(d) <> '';
  end if;

  v_antes := jsonb_build_object('slogan', v_e.slogan, 'estilo', v_e.estilo,
    'diferenciais', to_jsonb(v_e.diferenciais), 'bairro', v_e.bairro, 'endereco', v_e.endereco,
    'mostrar_endereco', v_e.mostrar_endereco);

  update public.empresas set
    slogan = case when p ? 'slogan' then public._texto_ou_nulo(p ->> 'slogan') else slogan end,
    estilo = case when p ? 'estilo' then (public._texto_ou_nulo(p ->> 'estilo'))::public.estilo_pagina
                  else estilo end,
    diferenciais = case when p ? 'diferenciais' then v_dif else diferenciais end,
    bairro = case when p ? 'bairro' then public._texto_ou_nulo(p ->> 'bairro') else bairro end,
    endereco = case when p ? 'endereco' then public._texto_ou_nulo(p ->> 'endereco') else endereco end,
    mostrar_endereco = case when p ? 'mostrar_endereco' then coalesce((p ->> 'mostrar_endereco')::boolean, false)
                            else mostrar_endereco end,
    pagina_personalizada_em = coalesce(pagina_personalizada_em, now())
  where id = v_e.id
  returning jsonb_build_object('slogan', slogan, 'estilo', estilo, 'diferenciais', to_jsonb(diferenciais),
    'bairro', bairro, 'endereco', endereco, 'mostrar_endereco', mostrar_endereco) into v_depois;

  if v_antes is distinct from v_depois then
    insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
    values (v_e.id, v_u.id, 'pagina.textos_alterados', 'empresa', v_e.id,
            jsonb_build_object('antes', v_antes, 'depois', v_depois));
  end if;
end;
$$;

/**
 * Galeria inteira, na ordem: [{caminho_640, caminho_1280, largura, altura, blur?, alt?}].
 * Substitui as fotos atuais. Devolve os caminhos que saíram (o servidor apaga do Storage).
 */
create or replace function public.salvar_galeria(p jsonb)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u        public.usuarios := public._pagina_dono();
  v_antes    jsonb;
  v_item     jsonb;
  v_ordem    integer := 0;
  v_mantidos text[] := '{}';
  v_saiu     text[];
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    raise exception 'PAGINA_INVALIDA' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p) > 12 then
    raise exception 'PAGINA_LIMITE' using errcode = 'check_violation', detail = 'galeria_fotos:12';
  end if;
  perform 1 from public.empresas where id = v_u.empresa_id for update;
  select coalesce(jsonb_agg(jsonb_build_object('c', g.caminho_1280, 'alt', g.alt) order by g.ordem), '[]')
    into v_antes from public.galeria_fotos g where g.empresa_id = v_u.empresa_id;

  for v_item in select * from jsonb_array_elements(p) loop
    v_mantidos := v_mantidos || array[v_item ->> 'caminho_640', v_item ->> 'caminho_1280'];
  end loop;
  select coalesce(array_agg(c), '{}') into v_saiu
  from public.galeria_fotos g, unnest(array[g.caminho_640, g.caminho_1280]) c
  where g.empresa_id = v_u.empresa_id and not (c = any (v_mantidos));

  delete from public.galeria_fotos where empresa_id = v_u.empresa_id;
  for v_item in select * from jsonb_array_elements(p) loop
    insert into public.galeria_fotos (empresa_id, caminho_640, caminho_1280, largura, altura, blur, alt, ordem)
    values (v_u.empresa_id, v_item ->> 'caminho_640', v_item ->> 'caminho_1280',
            (v_item ->> 'largura')::integer, (v_item ->> 'altura')::integer,
            public._texto_ou_nulo(v_item ->> 'blur'), public._texto_ou_nulo(v_item ->> 'alt'), v_ordem);
    v_ordem := v_ordem + 1;
  end loop;

  update public.empresas set pagina_personalizada_em = coalesce(pagina_personalizada_em, now())
  where id = v_u.empresa_id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'pagina.galeria_alterada', 'empresa', v_u.empresa_id,
          jsonb_build_object('antes', v_antes, 'depois',
            (select coalesce(jsonb_agg(jsonb_build_object('c', g.caminho_1280, 'alt', g.alt) order by g.ordem), '[]')
             from public.galeria_fotos g where g.empresa_id = v_u.empresa_id)));
  return v_saiu;
end;
$$;

/** Depoimentos inteiros, na ordem: [{nome, tipo_festa?, texto}]. Substitui os atuais. */
create or replace function public.salvar_depoimentos(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u     public.usuarios := public._pagina_dono();
  v_antes jsonb;
  v_item  jsonb;
  v_ordem integer := 0;
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    raise exception 'PAGINA_INVALIDA' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p) > 6 then
    raise exception 'PAGINA_LIMITE' using errcode = 'check_violation', detail = 'depoimentos:6';
  end if;
  perform 1 from public.empresas where id = v_u.empresa_id for update;
  select coalesce(jsonb_agg(jsonb_build_object('nome', d.nome, 'tipo_festa', d.tipo_festa, 'texto', d.texto)
                            order by d.ordem), '[]')
    into v_antes from public.depoimentos d where d.empresa_id = v_u.empresa_id;
  delete from public.depoimentos where empresa_id = v_u.empresa_id;
  for v_item in select * from jsonb_array_elements(p) loop
    insert into public.depoimentos (empresa_id, nome, tipo_festa, texto, ordem)
    values (v_u.empresa_id, btrim(v_item ->> 'nome'), public._texto_ou_nulo(v_item ->> 'tipo_festa'),
            btrim(v_item ->> 'texto'), v_ordem);
    v_ordem := v_ordem + 1;
  end loop;
  update public.empresas set pagina_personalizada_em = coalesce(pagina_personalizada_em, now())
  where id = v_u.empresa_id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'pagina.depoimentos_alterados', 'empresa', v_u.empresa_id,
          jsonb_build_object('antes', v_antes, 'depois', p));
end;
$$;

/** Perguntas do dono, na ordem: [{pergunta, resposta}]. Substitui as atuais. */
create or replace function public.salvar_perguntas(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u     public.usuarios := public._pagina_dono();
  v_antes jsonb;
  v_item  jsonb;
  v_ordem integer := 0;
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    raise exception 'PAGINA_INVALIDA' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p) > 8 then
    raise exception 'PAGINA_LIMITE' using errcode = 'check_violation', detail = 'perguntas_frequentes:8';
  end if;
  perform 1 from public.empresas where id = v_u.empresa_id for update;
  select coalesce(jsonb_agg(jsonb_build_object('pergunta', f.pergunta, 'resposta', f.resposta)
                            order by f.ordem), '[]')
    into v_antes from public.perguntas_frequentes f where f.empresa_id = v_u.empresa_id;
  delete from public.perguntas_frequentes where empresa_id = v_u.empresa_id;
  for v_item in select * from jsonb_array_elements(p) loop
    insert into public.perguntas_frequentes (empresa_id, pergunta, resposta, ordem)
    values (v_u.empresa_id, btrim(v_item ->> 'pergunta'), btrim(v_item ->> 'resposta'), v_ordem);
    v_ordem := v_ordem + 1;
  end loop;
  update public.empresas set pagina_personalizada_em = coalesce(pagina_personalizada_em, now())
  where id = v_u.empresa_id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'pagina.perguntas_alteradas', 'empresa', v_u.empresa_id,
          jsonb_build_object('antes', v_antes, 'depois', p));
end;
$$;

-- _diferenciais_validos fica executável: o check de empresas roda com quem grava (painel).
revoke all on function public._limite_pagina() from public, anon, authenticated;
revoke all on function public._pagina_dono() from public, anon, authenticated;
revoke all on function public._texto_ou_nulo(text) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array['public.salvar_pagina_publica(jsonb)', 'public.salvar_galeria(jsonb)',
                           'public.salvar_depoimentos(jsonb)', 'public.salvar_perguntas(jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Storage: pasta "galeria" no bucket midia (mesmas regras das outras pastas)
-- ---------------------------------------------------------------------------

drop policy if exists midia_insert_dono on storage.objects;
create policy midia_insert_dono
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'midia'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    and (storage.foldername(name))[2] in ('logo', 'capa', 'pacotes', 'galeria')
    and public.perfil_do_usuario() = 'dono'
  );

drop policy if exists midia_update_dono on storage.objects;
create policy midia_update_dono
  on storage.objects for update to authenticated
  using (
    bucket_id = 'midia'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    and public.perfil_do_usuario() = 'dono'
  )
  with check (
    bucket_id = 'midia'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
    and (storage.foldername(name))[2] in ('logo', 'capa', 'pacotes', 'galeria')
    and public.perfil_do_usuario() = 'dono'
  );

-- ---------------------------------------------------------------------------
-- 5. Leitura pública: publico.pagina(slug)
-- ---------------------------------------------------------------------------

/**
 * Conteúdo da página pública (além de publico.buffet e da vitrine). Vale também para a empresa
 * suspensa (a vitrine continua no ar, só sem orçamento). Endereço completo só se o dono marcar.
 * Nunca leva nada interno (e-mail, CNPJ, plano, auditoria).
 */
create or replace function publico.pagina(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'segmento', e.segmento,
    'slogan', e.slogan,
    'estilo', e.estilo,
    'diferenciais', to_jsonb(e.diferenciais),
    'bairro', e.bairro,
    'endereco', case when e.mostrar_endereco then e.endereco end,
    'galeria', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'caminho_640', g.caminho_640, 'caminho_1280', g.caminho_1280,
        'largura', g.largura, 'altura', g.altura, 'blur', g.blur, 'alt', g.alt) order by g.ordem)
      from public.galeria_fotos g where g.empresa_id = e.id), '[]'),
    'depoimentos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'nome', d.nome, 'tipo_festa', d.tipo_festa, 'texto', d.texto) order by d.ordem)
      from public.depoimentos d where d.empresa_id = e.id), '[]'),
    'perguntas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'pergunta', f.pergunta, 'resposta', f.resposta) order by f.ordem)
      from public.perguntas_frequentes f where f.empresa_id = e.id), '[]'))
  from public.empresas e
  where e.slug = lower(btrim(coalesce(p_slug, '')));
$$;

revoke all on function publico.pagina(text) from public, anon, authenticated;
grant execute on function publico.pagina(text) to anon;
