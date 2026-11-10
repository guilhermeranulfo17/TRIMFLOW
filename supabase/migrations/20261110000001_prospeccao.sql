-- Rastreio para o CRM de prospecção (nov/2026, ARQUITETURA §81).
--
-- O Orkestra avisa o CRM de prospecção (sistema separado, da equipe de vendas) quando um buffet
-- prospectado abre a demonstração, cria conta, cadastra pacote e publica a página. Aqui só o que o
-- banco precisa guardar: o vínculo da empresa com o lead do CRM e os marcos já avisados.
--
-- Tudo aditivo (funciona com o código da versão anterior): uma coluna nullable e uma ação nova no
-- limite de tentativas.

-- ---------------------------------------------------------------------------
-- empresas.prospeccao: vínculo com o lead do CRM e marcos já enviados
-- ---------------------------------------------------------------------------
-- { "r": "<id do lead que veio no link ?r=>", "crm_lead_id": "<id do lead no CRM>",
--   "conta_em": "<instante>", "pacote_em": "<instante>", "pagina_em": "<instante>" }
-- Escrita só pelo servidor, na conexão administrativa (server/prospeccao/vinculo). Ninguém grava
-- pela API: `authenticated` só tem UPDATE nas colunas concedidas uma a uma, e esta não entra.
alter table public.empresas add column if not exists prospeccao jsonb;

alter table public.empresas drop constraint if exists empresas_prospeccao_objeto;
alter table public.empresas add constraint empresas_prospeccao_objeto
  check (prospeccao is null or jsonb_typeof(prospeccao) = 'object');

comment on column public.empresas.prospeccao is
  'Vínculo com o CRM de prospecção (id do lead e marcos já avisados). Só o servidor escreve.';

-- ---------------------------------------------------------------------------
-- Limite de tentativas: ação "prospeccao" (rota pública /api/prospeccao/evento)
-- ---------------------------------------------------------------------------
alter table publico.tentativas drop constraint if exists tentativas_acao_check;
alter table publico.tentativas add constraint tentativas_acao_check
  check (acao in ('iniciar', 'pre_reserva', 'visita', 'funil', 'abertura', 'pdf',
                  'login', 'cadastro', 'recuperar_senha', 'webhook', 'cron',
                  'contrato_abrir', 'contrato_codigo', 'contrato_assinar', 'contrato_recusar',
                  'contrato_pdf', 'prospeccao'));

/**
 * Confere (e, com p_registrar, registra) uma tentativa. Devolve false quando o limite da última
 * hora já foi atingido em alguma das chaves (IP ou e-mail). Hashes vêm prontos do servidor
 * (sha256 com o sal IP_HASH_SALT): nem IP nem e-mail chegam aqui.
 *
 * Igual à versão de 20261013000002_seguranca, mais a ação "prospeccao" (30 por IP por hora: a
 * landing manda no máximo dois eventos por visita).
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
    ('cron',            20, null),
    ('prospeccao',      30, null)
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
