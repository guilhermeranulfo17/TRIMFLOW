-- Ajustes da análise de 17/11/2026 · Item 5: reserva confirmada com sinal zero (§99).
--
-- confirmar_reserva e criar_reserva aceitam confirmar sem sinal DE PROPÓSITO: o campo é opcional
-- na Agenda ("Sinal (opcional)"), há buffet que confirma pelo contrato e recebe depois. Não vira
-- validação. Em vez disso, o dono passa a ver o "sinal pendente":
--   * na Agenda (selo no cartão da reserva, só para o dono: o Financeiro é só dele);
--   * no resumo diário das 8h (contagem nova "sinal_pendente", só para o dono; o modelo do
--     WhatsApp não muda: a contagem vai só no painel, push e e-mail).
-- Regra: ESPELHO de domain/financeiro/sinal (sinalPendente), com teste de equivalência.
-- Só expansão: função nova e CREATE OR REPLACE de gerar_avisos_tempo (mesma assinatura).

create or replace function public._sinal_pendente(p_tipo text, p_status text, p_sinal integer,
  p_recebido integer, p_tem_plano boolean, p_data date, p_hoje date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tipo = 'confirmada' and p_status = 'ativa' and p_data >= p_hoje
     and not coalesce(p_sinal > 0, false) and coalesce(p_recebido, 0) <= 0
     and not coalesce(p_tem_plano, false);
$$;
revoke all on function public._sinal_pendente(text, text, integer, integer, boolean, date, date)
  from public, anon, authenticated;

-- gerar_avisos_tempo: igual à versão de 20261007000002, com "sinal_pendente" no resumo diário.
create or replace function public.gerar_avisos_tempo()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n     integer := 0;
  v_r     record;
  v_e     record;
  v_u     record;
  v_local timestamp;
  v_hoje  date;
  v_hora  integer;
  v_dados jsonb;
begin
  -- 1. pré-reserva vencendo (faltam 12h ou menos)
  for v_r in
    select r.id, r.lead_id, r.expira_em, r.sinal_centavos, l.nome
    from public.reservas r join public.leads l on l.id = r.lead_id
    where r.status = 'ativa' and r.tipo = 'pre_reserva' and not l.eh_teste
      and r.expira_em > now() and r.expira_em <= now() + interval '12 hours'
  loop
    v_n := v_n + public._aviso_para_lead(v_r.lead_id, 'pre_reserva_vencendo',
      jsonb_build_object('reserva_id', v_r.id, 'lead_nome', v_r.nome, 'expira_em', v_r.expira_em,
                         'sinal_centavos', v_r.sinal_centavos),
      'pre_reserva_vencendo:' || v_r.id);
  end loop;

  -- 2. cliente parou no meio (passou do passo 3, sem orçamento concluído, 30 min parado)
  for v_r in
    select l.id, l.nome, l.ultimo_passo from public.leads l
    where not l.eh_teste and l.status in ('novo', 'abandonou') and l.ultimo_passo >= 3
      and l.ultima_atividade_em < now() - interval '30 minutes'
      and l.ultima_atividade_em > now() - interval '1 day'
      and not exists (select 1 from public.orcamentos o
                      where o.lead_id = l.id and o.status not in ('em_montagem', 'substituido'))
  loop
    v_n := v_n + public._aviso_para_lead(v_r.id, 'cliente_parou',
      jsonb_build_object('lead_nome', v_r.nome, 'passo', v_r.ultimo_passo),
      'cliente_parou:' || v_r.id);
  end loop;

  for v_e in select e.id, e.fuso from public.empresas e loop
    v_local := now() at time zone v_e.fuso;
    v_hoje := v_local::date;
    v_hora := extract(hour from v_local)::integer;

    -- 3. orçamentos sem ação do vendedor (a cada 2h no horário comercial)
    if extract(dow from v_hoje) <> 0 and v_hora between 9 and 17 then
      for v_u in
        with sem_acao as (
          select l.id, coalesce(o.total_centavos, 0) as total
          from public.leads l
          join lateral (
            select ob.total_centavos from public.orcamentos ob
            where ob.lead_id = l.id and ob.status in ('enviado', 'visualizado')
              and ob.criado_em > now() - interval '7 days'
            order by ob.criado_em desc limit 1) o on true
          where l.empresa_id = v_e.id and not l.eh_teste and l.ultima_acao_vendedor_em is null
            and l.status in ('novo', 'em_andamento', 'abandonou')
        )
        select d.usuario, count(*)::integer as quantidade, sum(s.total)::bigint as total
        from sem_acao s, lateral public._aviso_destinatarios(v_e.id, s.id) d(usuario)
        group by d.usuario
      loop
        if public._aviso_criar(v_e.id, v_u.usuario, 'orcamentos_sem_acao', null,
             jsonb_build_object('quantidade', v_u.quantidade, 'total_centavos', v_u.total),
             'orcamentos_sem_acao:' || v_u.usuario || ':' || v_hoje || ':' || ((v_hora - 9) / 2)) is not null then
          v_n := v_n + 1;
        end if;
      end loop;
    end if;

    -- 4. resumo diário às 8h (dono: a empresa toda; vendedor: os leads dele e as tarefas dele)
    if v_hora >= 8 then
      for v_u in
        select u.id, u.perfil from public.usuarios u where u.empresa_id = v_e.id and u.ativo
          and not exists (select 1 from public.avisos a where a.chave = 'resumo_diario:' || u.id || ':' || v_hoje)
      loop
        select jsonb_build_object(
          'novos_ontem', (select count(*) from public.leads l
            where l.empresa_id = v_e.id and not l.eh_teste
              and public._dia_local(l.criado_em, v_e.fuso) = v_hoje - 1
              and (v_u.perfil = 'dono' or l.responsavel_id = v_u.id)),
          'pre_reservas_hoje', (select count(*) from public.reservas r join public.leads l on l.id = r.lead_id
            where r.empresa_id = v_e.id and r.status = 'ativa' and r.tipo = 'pre_reserva' and not l.eh_teste
              and public._dia_local(r.expira_em, v_e.fuso) = v_hoje
              and (v_u.perfil = 'dono' or l.responsavel_id = v_u.id)),
          'visitas_hoje', (select count(*) from public.visitas v join public.leads l on l.id = v.lead_id
            where v.empresa_id = v_e.id and v.status = 'confirmada' and not l.eh_teste
              and public._dia_local(v.data_hora, v_e.fuso) = v_hoje
              and (v_u.perfil = 'dono' or l.responsavel_id = v_u.id)),
          'tarefas_hoje', (select count(*) from public.tarefas t
            where t.empresa_id = v_e.id and t.responsavel_id = v_u.id
              and t.feita_em is null and t.cancelada_em is null
              and public._dia_local(t.vence_efetivo, v_e.fuso) = v_hoje and t.vence_efetivo >= now()),
          'atrasadas', (select count(*) from public.tarefas t
            where t.empresa_id = v_e.id and t.responsavel_id = v_u.id
              and t.feita_em is null and t.cancelada_em is null and t.vence_efetivo < now()),
          -- §99: reservas confirmadas sem sinal, sem recebimento e sem plano (só o dono vê valores)
          'sinal_pendente', case when v_u.perfil = 'dono' then (
            select count(*) from public.reservas r
            where r.empresa_id = v_e.id and r.data >= v_hoje
              and public._sinal_pendente(r.tipo::text, r.status::text, r.sinal_centavos,
                    (select coalesce(sum(rc.valor_centavos), 0)::integer from public.recebimentos rc
                     where rc.reserva_id = r.id and rc.estornado_em is null),
                    exists (select 1 from public.reserva_parcelas p where p.reserva_id = r.id),
                    r.data, v_hoje)) else 0 end
        ) into v_dados;
        if (select bool_or((value)::integer > 0) from jsonb_each_text(v_dados)) then
          if public._aviso_criar(v_e.id, v_u.id, 'resumo_diario', null, v_dados,
               'resumo_diario:' || v_u.id || ':' || v_hoje, false) is not null then
            v_n := v_n + 1;
          end if;
        end if;
      end loop;
    end if;
  end loop;

  return v_n;
end;
$$;
