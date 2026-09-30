-- Etapa 1 · RLS do catálogo e das regras.
-- Leitura: qualquer usuário ativo da empresa. Inserir/alterar/excluir: só dono.
-- anon sem acesso (a leitura pública do catálogo entra na Etapa 4, por função específica).

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'tipos_evento', 'espacos', 'turnos', 'feriados', 'ajustes_dia', 'faixas_deslocamento',
    'pacotes', 'faixas_preco', 'secoes_cardapio', 'faixas_idade', 'pacote_tipos_evento',
    'opcionais', 'opcional_pacotes', 'opcional_tipos_evento'
  ] loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('revoke all on public.%I from public, anon, authenticated', tabela);
    execute format('grant all on public.%I to service_role', tabela);
    execute format('grant select, insert, update, delete on public.%I to authenticated', tabela);

    execute format(
      'create policy %I on public.%I for select to authenticated
         using (empresa_id = public.empresa_do_usuario())',
      tabela || '_select_mesma_empresa', tabela);

    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (empresa_id = public.empresa_do_usuario() and public.perfil_do_usuario() = ''dono'')',
      tabela || '_insert_dono', tabela);

    execute format(
      'create policy %I on public.%I for update to authenticated
         using (empresa_id = public.empresa_do_usuario() and public.perfil_do_usuario() = ''dono'')
         with check (empresa_id = public.empresa_do_usuario() and public.perfil_do_usuario() = ''dono'')',
      tabela || '_update_dono', tabela);

    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (empresa_id = public.empresa_do_usuario() and public.perfil_do_usuario() = ''dono'')',
      tabela || '_delete_dono', tabela);
  end loop;
end;
$$;

-- regras_comerciais: criada pelo trigger; o painel só lê e o dono altera (nunca insere/apaga).
alter table public.regras_comerciais enable row level security;
revoke all on public.regras_comerciais from public, anon, authenticated;
grant all on public.regras_comerciais to service_role;
grant select on public.regras_comerciais to authenticated;
grant update (
  validade_dias, prazo_pre_reserva_horas, antecedencia_min_dias, sinal_bp, parcelas_max,
  prazo_ultima_parcela_dias, formas_pagamento, condicoes_texto, nao_incluso_texto,
  cancelamento_texto, modo_exibicao_preco, ajuste_incide, deslocamento_modelo,
  deslocamento_km_gratis, deslocamento_valor_km_centavos
) on public.regras_comerciais to authenticated;

create policy regras_comerciais_select_mesma_empresa
  on public.regras_comerciais for select to authenticated
  using (empresa_id = public.empresa_do_usuario());

create policy regras_comerciais_update_dono
  on public.regras_comerciais for update to authenticated
  using (empresa_id = public.empresa_do_usuario() and public.perfil_do_usuario() = 'dono')
  with check (empresa_id = public.empresa_do_usuario() and public.perfil_do_usuario() = 'dono');
