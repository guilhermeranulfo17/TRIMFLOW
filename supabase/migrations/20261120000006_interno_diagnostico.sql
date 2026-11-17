-- Ajustes da análise de 17/11/2026 · Itens 4, 5, 7 e 8: diagnóstico do /interno (§99).
--
-- Funções SOMENTE LEITURA para a tela /interno/diagnostico e para a análise semanal. Todas fora do
-- alcance de anon e authenticated (só a conexão administrativa). Contas de teste (demonstração,
-- apresentação e cortesia/isenta: _empresa_fora_das_metricas) ficam fora por padrão; o parâmetro
-- p_incluir_teste traz todas. Nenhuma devolve dado do cliente final (nome, telefone, e-mail).
-- Só expansão: funções novas.

-- ---------------------------------------------------------------------------------------------
-- Item 7: números da plataforma (base da análise semanal), sem as contas de teste por padrão
-- ---------------------------------------------------------------------------------------------
create or replace function public.interno_metricas_plataforma(p_incluir_teste boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with emp as (
    select e.* from public.empresas e
    where coalesce(p_incluir_teste, false) or not public._empresa_fora_das_metricas(e.id)
  )
  select jsonb_build_object(
    'empresas', (select count(*) from emp),
    'por_situacao', coalesce((select jsonb_object_agg(s.plano, s.n) from (
        select e.plano::text as plano, count(*) as n from emp e group by 1) s), '{}'::jsonb),
    'leads', (select count(*) from public.leads l join emp e on e.id = l.empresa_id
              where not l.eh_teste),
    'leads_30d', (select count(*) from public.leads l join emp e on e.id = l.empresa_id
                  where not l.eh_teste and l.criado_em > now() - interval '30 days'),
    'orcamentos', (select count(*) from public.orcamentos o join emp e on e.id = o.empresa_id
                   where not o.eh_teste and o.status <> 'em_montagem'),
    'orcamentos_aceitos', (select count(*) from public.orcamentos o join emp e on e.id = o.empresa_id
                           where not o.eh_teste and o.status = 'aceito'),
    'reservas_confirmadas', (select count(*) from public.reservas r join emp e on e.id = r.empresa_id
                             where r.tipo = 'confirmada' and r.status in ('ativa', 'realizada')),
    'pre_reservas_ativas', (select count(*) from public.reservas r join emp e on e.id = r.empresa_id
                            where r.tipo = 'pre_reserva' and r.status = 'ativa' and r.expira_em > now()),
    'contas_de_teste_fora', (select count(*) from public.empresas e
                             where public._empresa_fora_das_metricas(e.id)
                               and not coalesce(p_incluir_teste, false))
  );
$$;
revoke all on function public.interno_metricas_plataforma(boolean) from public, anon, authenticated;
grant execute on function public.interno_metricas_plataforma(boolean) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Item 5: reservas confirmadas com sinal pendente, por empresa (regra = _sinal_pendente)
-- ---------------------------------------------------------------------------------------------
create or replace function public.interno_sinal_pendente(p_incluir_teste boolean default false)
returns table (empresa_id uuid, empresa text, reservas bigint, valor_total_centavos bigint,
               proxima_festa date)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.nome, count(*), coalesce(sum(r.valor_total_centavos), 0), min(r.data)
  from public.reservas r
  join public.empresas e on e.id = r.empresa_id
  where (coalesce(p_incluir_teste, false) or not public._empresa_fora_das_metricas(e.id))
    and public._sinal_pendente(r.tipo::text, r.status::text, r.sinal_centavos,
          (select coalesce(sum(rc.valor_centavos), 0)::integer from public.recebimentos rc
           where rc.reserva_id = r.id and rc.estornado_em is null),
          exists (select 1 from public.reserva_parcelas p where p.reserva_id = r.id),
          r.data, (now() at time zone e.fuso)::date)
  group by e.id, e.nome
  order by min(r.data);
$$;
revoke all on function public.interno_sinal_pendente(boolean) from public, anon, authenticated;
grant execute on function public.interno_sinal_pendente(boolean) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Item 4: cobranças e assinaturas que vieram do sandbox do Asaas (link de fatura do sandbox)
-- ---------------------------------------------------------------------------------------------
create or replace function public.interno_cobrancas_sandbox()
returns table (origem text, status text, total bigint, vencimento_min date, vencimento_max date)
language sql
stable
security definer
set search_path = ''
as $$
  select 'cobranca', c.status, count(*), min(c.vencimento), max(c.vencimento)
  from public.cobrancas c where c.link_fatura ilike '%sandbox.asaas.com%'
  group by 2
  union all
  select 'modulo_cobranca', c.status, count(*), min(c.vencimento), max(c.vencimento)
  from public.modulo_cobrancas c where c.link_fatura ilike '%sandbox.asaas.com%'
  group by 2
  union all
  select 'assinatura', a.status, count(*), null::date, null::date
  from public.assinaturas a
  where exists (select 1 from public.cobrancas c
                where c.assinatura_id = a.id and c.link_fatura ilike '%sandbox.asaas.com%')
  group by 2
  order by 1, 2;
$$;
revoke all on function public.interno_cobrancas_sandbox() from public, anon, authenticated;
grant execute on function public.interno_cobrancas_sandbox() to service_role;

-- ---------------------------------------------------------------------------------------------
-- Item 8: testes grátis terminando e o que já foi avisado (painel e e-mail)
-- ---------------------------------------------------------------------------------------------
create or replace function public.interno_trials_terminando(p_dias integer default 14,
  p_incluir_teste boolean default false)
returns table (empresa_id uuid, empresa text, trial_ate timestamptz, situacao text,
               assinatura text, avisos_teste_acabando bigint, emails_enviados bigint,
               emails_pendentes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.nome, e.trial_ate, e.plano::text,
    (select a.status from public.assinaturas a where a.empresa_id = e.id and a.status <> 'cancelada'
     order by a.criada_em desc limit 1),
    (select count(*) from public.avisos v where v.empresa_id = e.id and v.tipo = 'teste_acabando'),
    (select count(*) from public.avisos_entregas x join public.avisos v on v.id = x.aviso_id
     where v.empresa_id = e.id and v.tipo = 'teste_acabando' and x.canal = 'email'
       and x.status = 'enviado'),
    (select count(*) from public.avisos_entregas x join public.avisos v on v.id = x.aviso_id
     where v.empresa_id = e.id and v.tipo = 'teste_acabando' and x.canal = 'email'
       and x.status in ('pendente', 'enviando'))
  from public.empresas e
  where e.plano = 'trial' and e.trial_ate is not null
    and e.trial_ate <= now() + make_interval(days => greatest(1, least(coalesce(p_dias, 14), 90)))
    and (coalesce(p_incluir_teste, false) or not public._empresa_fora_das_metricas(e.id))
  order by e.trial_ate;
$$;
revoke all on function public.interno_trials_terminando(integer, boolean) from public, anon, authenticated;
grant execute on function public.interno_trials_terminando(integer, boolean) to service_role;
