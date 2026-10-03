-- Etapa 9.5 (C) · Conta pelo Google. Quem entra pelo Google chega sem os dados do buffet (o
-- Google não manda nome_buffet, então o trigger do cadastro não cria nada) e completa em
-- /cadastro/completar, que chama completar_conta_dono. A criação da conta passa a morar em
-- _criar_conta_dono, usada pelo trigger (mesmo comportamento) e pela função nova.
-- Aditiva e compatível com o código anterior (o trigger continua igual por fora).

/** Empresa (teste de 14 dias) + usuário dono + auditoria. Devolve a empresa. Só interna. */
create or replace function public._criar_conta_dono(
  p_user uuid, p_email text, p_meta jsonb, p_origem text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome      text := nullif(btrim(p_meta ->> 'nome'), '');
  v_buffet    text := nullif(btrim(p_meta ->> 'nome_buffet'), '');
  v_whatsapp  text := nullif(btrim(p_meta ->> 'whatsapp_e164'), '');
  v_segmento  public.segmento_empresa;
  v_slug      text;
  v_empresa   uuid;
begin
  if v_nome is null or v_buffet is null or v_whatsapp is null or p_email is null then
    raise exception 'Cadastro incompleto: nome, nome do buffet, WhatsApp e e-mail são obrigatórios.'
      using errcode = 'not_null_violation';
  end if;

  v_segmento := (p_meta ->> 'segmento')::public.segmento_empresa;
  v_slug := public.resolver_slug_disponivel(p_meta ->> 'slug_base');

  insert into public.empresas (nome, slug, segmento, whatsapp_e164, email, plano, trial_ate)
  values (v_buffet, v_slug, v_segmento, v_whatsapp, lower(p_email), 'trial', now() + interval '14 days')
  returning id into v_empresa;

  insert into public.usuarios (id, empresa_id, nome, email, whatsapp_e164, perfil, ativo)
  values (p_user, v_empresa, v_nome, lower(p_email), v_whatsapp, 'dono', true);

  insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
  values (
    v_empresa,
    p_user,
    'conta.criada',
    'empresa',
    v_empresa,
    jsonb_build_object('slug', v_slug, 'segmento', v_segmento, 'origem', p_origem)
  );

  return v_empresa;
end;
$$;

/** Trigger do cadastro por e-mail: igual ao anterior, agora chamando _criar_conta_dono. */
create or replace function public.criar_conta_dono()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if not (meta ? 'nome_buffet') then
    return new;
  end if;
  perform public._criar_conta_dono(new.id, new.email, meta, 'cadastro');
  return new;
end;
$$;

/**
 * Completa a conta de quem entrou pelo Google (sessão sem usuário no Orkestra). Só para o próprio
 * auth.uid(); recusa sem sessão e sem e-mail; idempotente (se o usuário já existe, devolve a
 * empresa dele) e com trava por usuário contra dois cliques.
 */
create or replace function public.completar_conta_dono(
  p_nome text, p_buffet text, p_whatsapp_e164 text, p_segmento public.segmento_empresa,
  p_slug_base text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_email   text;
  v_empresa uuid;
begin
  if v_user is null then
    raise exception 'SEM_SESSAO' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('orkestra.completar_conta'), hashtext(v_user::text));

  select u.empresa_id into v_empresa from public.usuarios u where u.id = v_user;
  if found then
    return v_empresa;
  end if;

  select a.email into v_email from auth.users a where a.id = v_user;
  if v_email is null then
    raise exception 'SEM_EMAIL' using errcode = 'not_null_violation';
  end if;
  if p_whatsapp_e164 is null or p_whatsapp_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'WHATSAPP_INVALIDO' using errcode = 'check_violation';
  end if;

  return public._criar_conta_dono(
    v_user,
    v_email,
    jsonb_build_object(
      'nome', p_nome,
      'nome_buffet', p_buffet,
      'whatsapp_e164', p_whatsapp_e164,
      'segmento', p_segmento,
      'slug_base', p_slug_base
    ),
    'google'
  );
end;
$$;

revoke all on function public._criar_conta_dono(uuid, text, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.criar_conta_dono() from public, anon, authenticated;
revoke all on function public.completar_conta_dono(text, text, text, public.segmento_empresa, text)
  from public, anon;
grant execute on function public.completar_conta_dono(text, text, text, public.segmento_empresa, text)
  to authenticated;
