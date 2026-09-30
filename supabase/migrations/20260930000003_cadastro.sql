-- Etapa 0 · Cadastro atômico do dono.
-- O app chama supabase.auth.signUp() com metadados; o trigger abaixo roda na MESMA transação
-- do insert em auth.users. Se criar empresa, usuário ou auditoria falhar, o usuário do Auth
-- também não é gravado.

-- ---------------------------------------------------------------------------
-- Slug disponível: base (já normalizada pelo app) + sufixo numérico se existir.
-- ---------------------------------------------------------------------------
create or replace function public.resolver_slug_disponivel(base text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidato text := base;
  n int := 1;
  sufixo text;
begin
  if base is null
     or char_length(base) not between 3 and 60
     or base !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Slug inválido: %', coalesce(base, '(vazio)')
      using errcode = 'invalid_parameter_value';
  end if;

  -- Serializa cadastros concorrentes com a mesma base.
  perform pg_advisory_xact_lock(hashtext('empresas.slug:' || base));

  while exists (select 1 from public.empresas e where e.slug = candidato) loop
    n := n + 1;
    sufixo := '-' || n;
    candidato := rtrim(left(base, 60 - char_length(sufixo)), '-') || sufixo;
  end loop;

  return candidato;
end;
$$;

revoke all on function public.resolver_slug_disponivel(text) from public, anon, authenticated;
grant execute on function public.resolver_slug_disponivel(text) to service_role;

-- ---------------------------------------------------------------------------
-- Trigger: cria empresa (trial 14 dias) + usuário dono + auditoria.
-- Só age quando o signup traz nome_buffet nos metadados (convites futuros seguem outro caminho).
-- ---------------------------------------------------------------------------
create or replace function public.criar_conta_dono()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_nome      text := nullif(btrim(meta ->> 'nome'), '');
  v_buffet    text := nullif(btrim(meta ->> 'nome_buffet'), '');
  v_whatsapp  text := nullif(btrim(meta ->> 'whatsapp_e164'), '');
  v_segmento  public.segmento_empresa;
  v_slug      text;
  v_empresa   uuid;
begin
  if not (meta ? 'nome_buffet') then
    return new;
  end if;

  if v_nome is null or v_buffet is null or v_whatsapp is null or new.email is null then
    raise exception 'Cadastro incompleto: nome, nome do buffet, WhatsApp e e-mail são obrigatórios.'
      using errcode = 'not_null_violation';
  end if;

  v_segmento := (meta ->> 'segmento')::public.segmento_empresa;
  v_slug := public.resolver_slug_disponivel(meta ->> 'slug_base');

  insert into public.empresas (nome, slug, segmento, whatsapp_e164, email, plano, trial_ate)
  values (v_buffet, v_slug, v_segmento, v_whatsapp, lower(new.email), 'trial', now() + interval '14 days')
  returning id into v_empresa;

  insert into public.usuarios (id, empresa_id, nome, email, whatsapp_e164, perfil, ativo)
  values (new.id, v_empresa, v_nome, lower(new.email), v_whatsapp, 'dono', true);

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (
    v_empresa,
    new.id,
    'conta.criada',
    'empresa',
    v_empresa,
    jsonb_build_object('slug', v_slug, 'segmento', v_segmento, 'origem', 'cadastro')
  );

  return new;
end;
$$;

revoke all on function public.criar_conta_dono() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_conta_dono();
