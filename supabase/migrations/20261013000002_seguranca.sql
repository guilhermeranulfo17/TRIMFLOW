-- Etapa 9B · B.2 Segurança: limite de tentativas próprio (além do do Supabase Auth)
--
-- Mesma técnica do link público (publico.tentativas, só hashes, janela de 1 hora), agora para:
--   login            30 por IP e 10 por e-mail
--   cadastro         10 por IP
--   recuperar_senha  10 por IP e 5 por e-mail
--   webhook          20 tentativas com token errado por IP (Asaas)
--   cron             20 tentativas com segredo errado por IP (rotas chamadas pelo pg_cron)
-- No webhook e no cron só a tentativa recusada conta: chamada legítima nunca é barrada.

alter table publico.tentativas drop constraint if exists tentativas_acao_check;
alter table publico.tentativas add constraint tentativas_acao_check
  check (acao in ('iniciar', 'pre_reserva', 'visita', 'funil', 'abertura', 'pdf',
                  'login', 'cadastro', 'recuperar_senha', 'webhook', 'cron'));
alter table publico.tentativas drop constraint if exists tentativas_chave_tipo_check;
alter table publico.tentativas add constraint tentativas_chave_tipo_check
  check (chave_tipo in ('ip', 'whatsapp', 'empresa', 'email'));

/**
 * Confere (e, com p_registrar, registra) uma tentativa. Devolve false quando o limite da última
 * hora já foi atingido em alguma das chaves (IP ou e-mail). Hashes vêm prontos do servidor
 * (sha256 com o sal IP_HASH_SALT): nem IP nem e-mail chegam aqui.
 */
create or replace function publico.limite_acesso(
  p_acao text, p_ip_hash text, p_email_hash text default null, p_registrar boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lim_ip    integer;
  v_lim_email integer;
  v_ip        text := coalesce(nullif(btrim(coalesce(p_ip_hash, '')), ''), 'sem-ip');
  v_email     text := nullif(btrim(coalesce(p_email_hash, '')), '');
  v_total     integer;
begin
  select l.ip, l.email into v_lim_ip, v_lim_email
  from (values
    ('login',           30,   10),
    ('cadastro',        10, null),
    ('recuperar_senha', 10,    5),
    ('webhook',         20, null),
    ('cron',            20, null)
  ) as l(acao, ip, email)
  where l.acao = p_acao;
  if v_lim_ip is null then
    raise exception 'ACAO_INVALIDA' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_ip) > 128 or char_length(coalesce(v_email, '')) > 128 then
    raise exception 'ACAO_INVALIDA' using errcode = 'invalid_parameter_value';
  end if;

  select count(*) into v_total from publico.tentativas t
  where t.acao = p_acao and t.chave_tipo = 'ip' and t.chave_hash = v_ip
    and t.criado_em > now() - interval '1 hour';
  if v_total >= v_lim_ip then
    return false;
  end if;
  if v_email is not null and v_lim_email is not null then
    select count(*) into v_total from publico.tentativas t
    where t.acao = p_acao and t.chave_tipo = 'email' and t.chave_hash = v_email
      and t.criado_em > now() - interval '1 hour';
    if v_total >= v_lim_email then
      return false;
    end if;
  end if;

  if p_registrar then
    insert into publico.tentativas (acao, chave_tipo, chave_hash) values (p_acao, 'ip', v_ip);
    if v_email is not null and v_lim_email is not null then
      insert into publico.tentativas (acao, chave_tipo, chave_hash) values (p_acao, 'email', v_email);
    end if;
  end if;
  return true;
end;
$$;

revoke all on function publico.limite_acesso(text, text, text, boolean) from public, authenticated;
grant execute on function publico.limite_acesso(text, text, text, boolean) to anon;

-- Advisor "anon_security_definer_function_executable": o redirecionamento de slug antigo é lido
-- pelo servidor na conexão administrativa (server/db/admin.ts) e pelo link público via
-- publico.slug_atual. Ninguém precisa dela pela API REST do Supabase.
revoke execute on function public.slug_atual_por_antigo(text) from public, anon, authenticated;
