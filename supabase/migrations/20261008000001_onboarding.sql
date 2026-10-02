-- Etapa 8 · Onboarding guiado, preço confirmado e checklist.
--
-- Preço confirmado: nenhum preço de exemplo do modelo vai a público sem o dono confirmar.
--   pacotes.preco_confirmado_em / opcionais.preco_confirmado_em (nullable). Um trigger preenche
--   a data sempre que um campo de preço é gravado (em qualquer tela, inclusive pelo código da
--   versão anterior durante o deploy), EXCETO quando a transação grava o modelo de segmento
--   (gravarModelo liga `orkestra.modelo = 1` na própria transação).
-- Migração: o que já existe recebe now() (o dono já viu e salvou), para nenhum link no ar parar;
--   empresas com pacote já têm o onboarding concluído.

-- ---------------------------------------------------------------------------
-- Colunas
-- ---------------------------------------------------------------------------
alter table public.empresas
  add column onboarding_passo        smallint not null default 1
    check (onboarding_passo between 1 and 5),
  add column onboarding_iniciado_em  timestamptz,
  add column onboarding_concluido_em timestamptz,
  add column link_na_bio_em          timestamptz,
  add column link_testado_em         timestamptz;

comment on column public.empresas.onboarding_passo is
  'Passo atual do onboarding (/app/comecar): 1 modelo, 2 identidade, 3 preços, 4 agenda, 5 pronto.';
comment on column public.empresas.link_na_bio_em is 'O dono marcou "Fiz" no item "link na bio" do checklist.';
comment on column public.empresas.link_testado_em is 'Primeira vez que alguém da empresa abriu o link em modo teste.';

alter table public.usuarios add column checklist_dispensado_em timestamptz;

alter table public.pacotes add column preco_confirmado_em timestamptz;
alter table public.opcionais add column preco_confirmado_em timestamptz;

comment on column public.pacotes.preco_confirmado_em is
  'Quando o dono confirmou o preço. Nulo = preço de exemplo do modelo: o pacote não aparece no link.';
comment on column public.opcionais.preco_confirmado_em is
  'Quando o dono confirmou o preço. Nulo = preço de exemplo do modelo: o opcional não aparece no link.';

-- Migração: tudo o que já existe foi visto e salvo pelo dono.
update public.pacotes set preco_confirmado_em = now() where preco_confirmado_em is null;
update public.opcionais set preco_confirmado_em = now() where preco_confirmado_em is null;

update public.empresas e
set onboarding_passo = 5,
    onboarding_iniciado_em = coalesce(e.onboarding_iniciado_em, e.criado_em),
    onboarding_concluido_em = now()
where exists (select 1 from public.pacotes p where p.empresa_id = e.id);

-- ---------------------------------------------------------------------------
-- Trigger: gravar preço confirma
-- ---------------------------------------------------------------------------
create or replace function public._gravando_modelo()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('orkestra.modelo', true), '') = '1';
$$;

create or replace function public._confirmar_preco()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public._gravando_modelo() then
    return new;
  end if;
  if tg_table_name = 'pacotes' then
    if tg_op = 'INSERT' then
      new.preco_confirmado_em := coalesce(new.preco_confirmado_em, now());
    elsif new.preco_pessoa_centavos is distinct from old.preco_pessoa_centavos
       or new.valor_excedente_centavos is distinct from old.valor_excedente_centavos
       or new.modelo_preco is distinct from old.modelo_preco then
      new.preco_confirmado_em := now();
    end if;
  else
    if tg_op = 'INSERT' then
      new.preco_confirmado_em := coalesce(new.preco_confirmado_em, now());
    elsif new.preco_centavos is distinct from old.preco_centavos
       or new.cobranca is distinct from old.cobranca then
      new.preco_confirmado_em := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger pacotes_confirmar_preco
  before insert or update on public.pacotes
  for each row execute function public._confirmar_preco();

create trigger opcionais_confirmar_preco
  before insert or update on public.opcionais
  for each row execute function public._confirmar_preco();

/** Faixa de preço gravada (inserida, alterada ou apagada) confirma o pacote. */
create or replace function public._faixa_confirma_pacote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pacote uuid := coalesce(new.pacote_id, old.pacote_id);
begin
  if not public._gravando_modelo() then
    update public.pacotes set preco_confirmado_em = now() where id = v_pacote;
  end if;
  return null;
end;
$$;

create trigger faixas_preco_confirmam_pacote
  after insert or update or delete on public.faixas_preco
  for each row execute function public._faixa_confirma_pacote();

-- ---------------------------------------------------------------------------
-- Funções do onboarding e do checklist (só dono, com auditoria)
-- ---------------------------------------------------------------------------

/** Dono ativo logado (ou erro). */
create or replace function public._onboarding_dono()
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
    raise exception 'ONBOARDING_SO_DONO' using errcode = 'insufficient_privilege';
  end if;
  return v;
end;
$$;

/** Tem pelo menos 1 pacote ativo com preço confirmado? (mesma regra de pendenciasDoLinkPublico) */
create or replace function public._tem_pacote_confirmado(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pacotes p
    where p.empresa_id = p_empresa and p.ativo and p.preco_confirmado_em is not null
      and case p.modelo_preco
            when 'por_pessoa' then p.preco_pessoa_centavos is not null
            else p.valor_excedente_centavos is not null
                 and exists (select 1 from public.faixas_preco f where f.pacote_id = p.id)
          end);
$$;

/**
 * Vai para o passo p_passo do onboarding (voltar também). Passar do passo 3 exige um pacote com
 * preço confirmado. Passo 5 conclui. Devolve o passo gravado.
 */
create or replace function public.avancar_onboarding(p_passo smallint)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._onboarding_dono();
  v_e public.empresas;
begin
  if p_passo is null or p_passo not between 1 and 5 then
    raise exception 'ONBOARDING_PASSO_INVALIDO' using errcode = 'check_violation';
  end if;
  select * into v_e from public.empresas where id = v_u.empresa_id for update;
  if p_passo > 3 and not public._tem_pacote_confirmado(v_e.id) then
    raise exception 'ONBOARDING_SEM_PRECO' using errcode = 'check_violation';
  end if;
  update public.empresas
  set onboarding_passo = p_passo,
      onboarding_iniciado_em = coalesce(onboarding_iniciado_em, now()),
      onboarding_concluido_em = case when p_passo = 5
                                     then coalesce(onboarding_concluido_em, now())
                                     else onboarding_concluido_em end
  where id = v_e.id;
  if p_passo = 5 and v_e.onboarding_concluido_em is null then
    insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
    values (v_e.id, v_u.id, 'onboarding.concluido', 'empresa', v_e.id,
            jsonb_build_object('iniciado_em', coalesce(v_e.onboarding_iniciado_em, now()),
                               'concluido_em', now()));
  end if;
  return p_passo;
end;
$$;

/**
 * Passo 3: grava e confirma os preços digitados pelo dono, em lote.
 * p_precos = {"pacotes": [{"id", "preco_pessoa_centavos"?, "valor_excedente_centavos"?,
 *              "faixas": [{"ate_convidados", "valor_centavos"}]?}],
 *             "opcionais": [{"id", "preco_centavos"}]}
 * Pacote por pessoa exige preco_pessoa_centavos; por faixa exige faixas (ate_convidados
 * crescente, sem repetir) e valor_excedente_centavos. Devolve quantos itens foram confirmados.
 */
create or replace function public.confirmar_precos(p_precos jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u      public.usuarios := public._onboarding_dono();
  v_item   jsonb;
  v_p      public.pacotes;
  v_faixa  jsonb;
  v_ultimo integer;
  v_n      integer := 0;
  v_antes  jsonb := '[]'::jsonb;
begin
  if p_precos is null or jsonb_typeof(p_precos) <> 'object' then
    raise exception 'PRECO_INVALIDO' using errcode = 'check_violation';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_precos -> 'pacotes', '[]'::jsonb)) loop
    select * into v_p from public.pacotes
    where id = (v_item ->> 'id')::uuid and empresa_id = v_u.empresa_id for update;
    if v_p.id is null then
      raise exception 'PACOTE_NAO_ENCONTRADO' using errcode = 'no_data_found';
    end if;
    v_antes := v_antes || jsonb_build_object('pacote', v_p.id,
      'preco_pessoa_centavos', v_p.preco_pessoa_centavos,
      'valor_excedente_centavos', v_p.valor_excedente_centavos,
      'faixas', coalesce((select jsonb_agg(jsonb_build_object('ate', f.ate_convidados, 'valor', f.valor_centavos)
                          order by f.ate_convidados) from public.faixas_preco f where f.pacote_id = v_p.id), '[]'));

    if v_p.modelo_preco = 'por_pessoa' then
      if (v_item ->> 'preco_pessoa_centavos') is null
         or (v_item ->> 'preco_pessoa_centavos')::integer not between 1 and 100000000 then
        raise exception 'PRECO_INVALIDO' using errcode = 'check_violation';
      end if;
      update public.pacotes
      set preco_pessoa_centavos = (v_item ->> 'preco_pessoa_centavos')::integer,
          preco_confirmado_em = now()
      where id = v_p.id;
    else
      if jsonb_typeof(v_item -> 'faixas') <> 'array' or jsonb_array_length(v_item -> 'faixas') = 0
         or (v_item ->> 'valor_excedente_centavos') is null
         or (v_item ->> 'valor_excedente_centavos')::integer not between 0 and 100000000 then
        raise exception 'PRECO_INVALIDO' using errcode = 'check_violation';
      end if;
      v_ultimo := 0;
      for v_faixa in select * from jsonb_array_elements(v_item -> 'faixas') loop
        if (v_faixa ->> 'ate_convidados')::integer <= v_ultimo
           or (v_faixa ->> 'valor_centavos')::integer not between 1 and 2000000000 then
          raise exception 'PRECO_INVALIDO' using errcode = 'check_violation';
        end if;
        v_ultimo := (v_faixa ->> 'ate_convidados')::integer;
      end loop;
      delete from public.faixas_preco where pacote_id = v_p.id;
      insert into public.faixas_preco (empresa_id, pacote_id, ate_convidados, valor_centavos)
      select v_u.empresa_id, v_p.id, (f ->> 'ate_convidados')::integer, (f ->> 'valor_centavos')::integer
      from jsonb_array_elements(v_item -> 'faixas') f;
      update public.pacotes
      set valor_excedente_centavos = (v_item ->> 'valor_excedente_centavos')::integer,
          preco_confirmado_em = now()
      where id = v_p.id;
    end if;
    v_n := v_n + 1;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_precos -> 'opcionais', '[]'::jsonb)) loop
    if (v_item ->> 'preco_centavos') is null
       or (v_item ->> 'preco_centavos')::integer not between 0 and 100000000 then
      raise exception 'PRECO_INVALIDO' using errcode = 'check_violation';
    end if;
    update public.opcionais
    set preco_centavos = (v_item ->> 'preco_centavos')::integer, preco_confirmado_em = now()
    where id = (v_item ->> 'id')::uuid and empresa_id = v_u.empresa_id;
    if not found then
      raise exception 'OPCIONAL_NAO_ENCONTRADO' using errcode = 'no_data_found';
    end if;
    v_n := v_n + 1;
  end loop;

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'catalogo.precos_confirmados', 'empresa', v_u.empresa_id,
          jsonb_build_object('antes', v_antes, 'depois', p_precos));
  return v_n;
end;
$$;

/** Item manual do checklist: "coloquei o link na bio". */
create or replace function public.marcar_link_na_bio(p_feito boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios := public._onboarding_dono();
begin
  update public.empresas
  set link_na_bio_em = case when coalesce(p_feito, false) then coalesce(link_na_bio_em, now()) end
  where id = v_u.empresa_id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'checklist.link_na_bio', 'empresa', v_u.empresa_id,
          jsonb_build_object('feito', coalesce(p_feito, false)));
end;
$$;

/** Alguém da empresa abriu o link em modo teste (registra só a primeira vez). */
create or replace function public.marcar_link_testado()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  select u.empresa_id into v_empresa from public.usuarios u where u.id = auth.uid() and u.ativo;
  if v_empresa is null then
    return;
  end if;
  update public.empresas set link_testado_em = now()
  where id = v_empresa and link_testado_em is null;
end;
$$;

/** Dispensar (ou reativar) o checklist, por usuário. */
create or replace function public.dispensar_checklist(p_dispensar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.usuarios;
begin
  select * into v_u from public.usuarios u where u.id = auth.uid() and u.ativo;
  if v_u.id is null then
    raise exception 'ONBOARDING_SO_DONO' using errcode = 'insufficient_privilege';
  end if;
  update public.usuarios
  set checklist_dispensado_em = case when coalesce(p_dispensar, false) then now() end
  where id = v_u.id;
  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (v_u.empresa_id, v_u.id, 'checklist.dispensado', 'usuario', v_u.id,
          jsonb_build_object('dispensado', coalesce(p_dispensar, false)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke all on function public._gravando_modelo() from public, anon;
-- chamada pelo trigger de pacotes/opcionais, que roda com o papel de quem grava
grant execute on function public._gravando_modelo() to authenticated;
revoke all on function public._confirmar_preco() from public, anon, authenticated;
revoke all on function public._faixa_confirma_pacote() from public, anon, authenticated;
revoke all on function public._onboarding_dono() from public, anon, authenticated;
revoke all on function public._tem_pacote_confirmado(uuid) from public, anon, authenticated;
revoke all on function public.avancar_onboarding(smallint) from public, anon;
revoke all on function public.confirmar_precos(jsonb) from public, anon;
revoke all on function public.marcar_link_na_bio(boolean) from public, anon;
revoke all on function public.marcar_link_testado() from public, anon;
revoke all on function public.dispensar_checklist(boolean) from public, anon;
grant execute on function public.avancar_onboarding(smallint) to authenticated;
grant execute on function public.confirmar_precos(jsonb) to authenticated;
grant execute on function public.marcar_link_na_bio(boolean) to authenticated;
grant execute on function public.marcar_link_testado() to authenticated;
grant execute on function public.dispensar_checklist(boolean) to authenticated;
