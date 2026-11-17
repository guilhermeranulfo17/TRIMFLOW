-- Ajustes da análise de 17/11/2026 · Item 8: "teste acabando" também para quem tem assinatura
-- pendente (§99).
--
-- Achado: atualizar_situacoes só avisava "teste acabando" (3 dias e 1 dia antes, painel, push e
-- e-mail) se a empresa não tivesse NENHUMA assinatura não cancelada. Quem clicou em "Assinar" e não
-- pagou (assinatura "pendente", fatura em aberto) ficava sem aviso e era suspenso no fim do teste
-- do mesmo jeito (assinatura pendente não dá acesso: _situacao_conta). Agora só quem tem
-- assinatura ATIVA (paga) deixa de receber, o que na prática já tira a empresa do "trial". Com
-- assinatura pendente, o aviso leva "fatura_pendente": true e o texto pede para pagar a fatura
-- (domain/avisos/textos). Mesma assinatura e mesmas chaves (idempotente).

create or replace function public.atualizar_situacoes(p_agora timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e      record;
  v_n      integer := 0;
  v_resta  interval;
  v_marco  integer;
begin
  for v_e in select e.id from public.empresas e order by e.id loop
    if public._atualizar_situacao(v_e.id, p_agora) = 'trial' then
      select e.trial_ate - p_agora into v_resta from public.empresas e where e.id = v_e.id;
      v_marco := case when v_resta <= interval '1 day' then 1
                      when v_resta <= interval '3 days' then 3 end;
      if v_marco is not null and not exists (
        select 1 from public.assinaturas a where a.empresa_id = v_e.id and a.status = 'ativa') then
        v_n := v_n + public._aviso_donos(v_e.id, 'teste_acabando',
          jsonb_build_object('dias', greatest(1, ceil(extract(epoch from v_resta) / 86400))::integer)
          || case when exists (select 1 from public.assinaturas a
                               where a.empresa_id = v_e.id and a.status = 'pendente')
                  then jsonb_build_object('fatura_pendente', true) else '{}'::jsonb end,
          'teste_acabando:' || v_marco || ':' || v_e.id);
      end if;
    end if;
  end loop;
  return v_n;
end;
$$;
