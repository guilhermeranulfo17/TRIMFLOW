-- Mensagem programada (§93): as preferências de aviso passam a aceitar o tipo novo
-- (canal push, como os demais). Mesma função de 20261016000002, só a lista de tipos cresce.

create or replace function public.salvar_preferencias_avisos(
  p_canais jsonb, p_silencio_inicio time, p_silencio_fim time, p_receber_de_vendedores boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u     record := public._avisos_usuario();
  v_antes jsonb;
  v_k     text;
begin
  if p_canais is null or jsonb_typeof(p_canais) <> 'object' then
    raise exception 'AVISO_PREFERENCIA_INVALIDA' using errcode = 'check_violation';
  end if;
  for v_k in select jsonb_object_keys(p_canais) loop
    if v_k not in ('pre_reserva_pedida', 'visita_pedida', 'pre_reserva_vencendo', 'orcamentos_sem_acao',
                   'cliente_parou', 'cliente_esquentou', 'resumo_diario', 'contrato_aberto',
                   'contrato_assinado', 'contrato_ajuste', 'contrato_vencendo',
                   'mensagem_programada')
       or jsonb_typeof(p_canais -> v_k) <> 'array'
       or exists (select 1 from jsonb_array_elements_text(p_canais -> v_k) c(v)
                  where c.v not in ('push', 'whatsapp')) then
      raise exception 'AVISO_PREFERENCIA_INVALIDA' using errcode = 'check_violation';
    end if;
  end loop;
  select to_jsonb(p) into v_antes from public.preferencias_avisos p where p.usuario_id = v_u.id;
  insert into public.preferencias_avisos as p (usuario_id, empresa_id, canais, silencio_inicio,
    silencio_fim, receber_de_vendedores)
  values (v_u.id, v_u.empresa_id, p_canais, coalesce(p_silencio_inicio, '22:00'),
    coalesce(p_silencio_fim, '07:00'), coalesce(p_receber_de_vendedores, false) and v_u.perfil = 'dono')
  on conflict (usuario_id) do update set canais = excluded.canais,
    silencio_inicio = excluded.silencio_inicio, silencio_fim = excluded.silencio_fim,
    receber_de_vendedores = excluded.receber_de_vendedores, atualizado_em = now();
  perform public._auditar_lead(v_u.empresa_id, 'preferencias_avisos.salvar', 'preferencias_avisos',
    v_u.id, jsonb_build_object('antes', v_antes, 'depois', jsonb_build_object('canais', p_canais,
      'silencio_inicio', p_silencio_inicio, 'silencio_fim', p_silencio_fim)));
end;
$$;
