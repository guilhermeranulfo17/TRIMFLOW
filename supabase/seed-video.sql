-- Seed do VÍDEO DE VENDAS (VSL): "Buffet Estrela". Só banco LOCAL. Dados 100% fictícios.
-- Nunca rode em produção.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/seed-video.sql
--
-- Usuário de teste do painel (dono do Buffet Estrela):
--   e-mail: dono@estrela.local
--   senha:  estrela-video-2026
--
-- O que o seed monta:
--   * pacotes Alegria, Super e Encanto (preço por faixa de convidados)
--   * ajuste de sábado +10% (sobre o pacote); crianças de 6 a 10 anos pagam 50%
--   * opcional "Mesa temática" R$ 600 (valor fixo)
--   * agenda de dezembro/2026 com datas ocupadas (o sábado 05/12 à TARDE fica livre: é a data
--     que a Mariana escolhe no vídeo)
--   * 6 leads fictícios, um em cada etapa do funil (novo, conversa, proposta, pré-reserva,
--     reservado, perdido)
--   * onboarding concluído, plano ativo e Termos aceitos (painel limpo, sem faixas)
-- Idempotente: apaga e recria a empresa "buffet-estrela" inteira.

begin;

-- limpa uma rodada anterior (cascata em tudo da empresa; triggers de escrita liberadas)
select set_config('orkestra.permitir_escrita', '1', true);
do $$
declare
  t text;
begin
  -- apaga tabela por tabela com as FKs em pausa (usuarios é RESTRICT em empresas)
  set local session_replication_role = replica;
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb using (table_schema, table_name)
    where c.table_schema = 'public' and c.column_name = 'empresa_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('delete from public.%I where empresa_id = %L', t, 'e5000000-0000-4000-8000-000000000001');
  end loop;
  delete from public.empresas where id = 'e5000000-0000-4000-8000-000000000001';
  set local session_replication_role = origin;
end;
$$;
delete from auth.identities where user_id = 'e5a00000-0000-4000-8000-000000000001';
delete from auth.users where id = 'e5a00000-0000-4000-8000-000000000001';

insert into public.empresas (id, nome, slug, segmento, whatsapp_e164, email, cidade, uf, plano,
  trial_ate, razao_social, cnpj, endereco, bairro, mostrar_endereco)
values ('e5000000-0000-4000-8000-000000000001', 'Buffet Estrela', 'buffet-estrela', 'infantil',
  '+5534990000100', 'contato@estrela.local', 'Uberlândia', 'MG', 'trial',
  now() + interval '14 days', 'Buffet Estrela Festas Ltda', '11444777000161',
  'Av. das Festas, 500 - Uberlândia/MG', 'Jardim Estrela', false);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000', 'e5a00000-0000-4000-8000-000000000001', 'authenticated',
  'authenticated', 'dono@estrela.local',
  extensions.crypt('estrela-video-2026', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb, '{"nome": "Camila Estrela"}'::jsonb,
  now(), now(), '', '', '', ''
);

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('e5a00000-0000-4000-8000-000000000001', 'e5a00000-0000-4000-8000-000000000001',
  'e5a00000-0000-4000-8000-000000000001',
  jsonb_build_object('sub', 'e5a00000-0000-4000-8000-000000000001', 'email', 'dono@estrela.local',
                     'email_verified', true),
  'email', now(), now(), now());

insert into public.usuarios (id, empresa_id, nome, email, whatsapp_e164, perfil, limite_desconto_pct,
  termos_versao, termos_aceitos_em)
values ('e5a00000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001',
  'Camila', 'dono@estrela.local', '+5534990000101', 'dono', 100, '2026-10-05', now());

-- checklist do onboarding dispensado (painel limpo para as capturas)
update public.usuarios set checklist_dispensado_em = now()
where id = 'e5a00000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Catálogo, turnos, ajustes e regras comerciais
-- ---------------------------------------------------------------------------
do $$
declare
  est constant uuid := 'e5000000-0000-4000-8000-000000000001';
  t_aniversario uuid;
  p_alegria uuid;
  p_super uuid;
  p_encanto uuid;
  o_personagem uuid;
begin
  perform set_config('orkestra.permitir_escrita', '1', true);

  insert into public.tipos_evento (empresa_id, nome, icone, ordem, texto_abertura)
    values (est, 'Aniversário infantil', 'party-popper', 0,
      'Olá, {nome}! Que alegria fazer parte desse dia. Preparamos a proposta do aniversário em {data}, para {convidados} convidados, com tudo o que o {buffet} oferece para a festa ser inesquecível.')
    returning id into t_aniversario;
  insert into public.tipos_evento (empresa_id, nome, icone, ordem) values
    (est, 'Chá revelação', 'baby', 1),
    (est, 'Batizado', 'church', 2);

  insert into public.espacos (empresa_id, nome, capacidade_max, no_local_do_cliente, ordem)
    values (est, 'Salão principal', 120, false, 0);

  insert into public.turnos (empresa_id, nome, hora_inicio, duracao_min, dias_semana, ordem) values
    (est, 'Almoço', '10:00', 240, '{0,1,2,3,4,5,6}', 0),
    (est, 'Tarde', '15:00', 240, '{0,1,2,3,4,5,6}', 1),
    (est, 'Noite', '20:00', 240, '{0,1,2,3,4,5,6}', 2);

  -- só a regra de sábado (+10%), como no roteiro
  insert into public.ajustes_dia (empresa_id, tipo, dia_semana, ajuste_bp) values
    (est, 'dia_semana', 6, 1000);

  insert into public.faixas_idade (empresa_id, rotulo, idade_min, idade_max, fator_bp, ordem) values
    (est, '0 a 5 anos', 0, 5, 0, 0),
    (est, '6 a 10 anos', 6, 10, 5000, 1),
    (est, '11 anos ou mais', 11, null, 10000, 2);

  insert into public.pacotes (empresa_id, nome, subtitulo, descricao, destaque, modelo_preco,
      valor_excedente_centavos, min_convidados, max_convidados, duracao_inclusa_min,
      valor_hora_extra_centavos, ordem)
    values (est, 'Alegria', 'O essencial para uma festa gostosa',
      'Salgados fritos na hora, bebidas, doces e bolo.', false, 'por_faixa',
      7500, 15, 120, 240, 35000, 0)
    returning id into p_alegria;
  insert into public.pacotes (empresa_id, nome, subtitulo, descricao, destaque, modelo_preco,
      valor_excedente_centavos, min_convidados, max_convidados, duracao_inclusa_min,
      valor_hora_extra_centavos, ordem)
    values (est, 'Super', 'O mais escolhido',
      'Mais variedade de salgados, prato quente e mesa de doces.', true, 'por_faixa',
      8500, 15, 120, 240, 45000, 1)
    returning id into p_super;
  insert into public.pacotes (empresa_id, nome, subtitulo, descricao, destaque, modelo_preco,
      valor_excedente_centavos, min_convidados, max_convidados, duracao_inclusa_min,
      valor_hora_extra_centavos, ordem)
    values (est, 'Encanto', 'Completo, com bolo cenográfico',
      'Tudo do Super, mais finger foods, doces finos e bolo cenográfico.', false, 'por_faixa',
      10500, 15, 120, 240, 60000, 2)
    returning id into p_encanto;

  insert into public.faixas_preco (empresa_id, pacote_id, ate_convidados, valor_centavos) values
    (est, p_alegria, 30, 290000), (est, p_alegria, 50, 390000), (est, p_alegria, 80, 560000),
    (est, p_super, 30, 340000), (est, p_super, 50, 450000), (est, p_super, 80, 650000),
    (est, p_encanto, 30, 420000), (est, p_encanto, 50, 560000), (est, p_encanto, 80, 810000);

  insert into public.secoes_cardapio (empresa_id, pacote_id, nome, itens, ordem) values
    (est, p_alegria, 'Salgados', '{"Coxinha","Bolinha de queijo","Risole de carne","Enroladinho de salsicha"}', 0),
    (est, p_alegria, 'Bebidas', '{"Refrigerante","Suco natural","Água"}', 1),
    (est, p_alegria, 'Doces', '{"Brigadeiro","Beijinho"}', 2),
    (est, p_alegria, 'Bolo', '{"Bolo de chocolate com brigadeiro"}', 3),
    (est, p_super, 'Entradas', '{"Mini pizza","Pão de queijo"}', 0),
    (est, p_super, 'Salgados', '{"Coxinha","Kibe","Esfiha","Empadinha","Risole de queijo"}', 1),
    (est, p_super, 'Prato quente', '{"Mini hambúrguer","Batata frita"}', 2),
    (est, p_super, 'Bebidas', '{"Refrigerante","Suco natural","Água"}', 3),
    (est, p_super, 'Doces', '{"Brigadeiro","Beijinho","Cajuzinho","Bicho de pé"}', 4),
    (est, p_encanto, 'Finger foods', '{"Mini quiche","Bruschetta","Mini wrap"}', 0),
    (est, p_encanto, 'Salgados', '{"Coxinha","Kibe","Esfiha","Empadinha","Croquete"}', 1),
    (est, p_encanto, 'Prato quente', '{"Escondidinho","Mini hambúrguer","Batata rústica"}', 2),
    (est, p_encanto, 'Bebidas', '{"Refrigerante","Suco natural","Água aromatizada"}', 3),
    (est, p_encanto, 'Doces finos', '{"Brigadeiro gourmet","Trufa","Camafeu","Bombom de uva"}', 4);

  insert into public.opcionais (empresa_id, nome, descricao, cobranca, preco_centavos, qtd_min, qtd_max, ordem)
    values (est, 'Mesa temática', 'Decoração da mesa do bolo no tema da festa.', 'fixo', 60000, 1, 1, 0);
  insert into public.opcionais (empresa_id, nome, descricao, cobranca, preco_centavos, qtd_min, qtd_max, ordem)
    values (est, 'Personagem vivo', 'Personagem animando a festa por 1 hora.', 'por_unidade', 35000, 1, 3, 1)
    returning id into o_personagem;
  insert into public.opcional_tipos_evento (empresa_id, opcional_id, tipo_evento_id)
    values (est, o_personagem, t_aniversario);

  update public.regras_comerciais set
    validade_dias = 15,
    prazo_pre_reserva_horas = 48,
    antecedencia_min_dias = 7,
    sinal_bp = 3000,
    parcelas_max = 3,
    prazo_ultima_parcela_dias = 7,
    formas_pagamento = '{"Pix","Cartão de crédito"}',
    condicoes_texto = 'Sinal de 30% para reservar a data. Saldo em até 3 vezes, com a última parcela até 7 dias antes da festa.',
    nao_incluso_texto = 'Bebidas alcoólicas e itens que não estão no pacote.',
    cancelamento_texto = 'Cancelamento com mais de 30 dias de antecedência: devolução de 50% do sinal. Com menos de 30 dias, o sinal não é devolvido.',
    alteracao_convidados_texto = 'O número de convidados pode ser ajustado até 7 dias antes da festa.',
    modo_exibicao_preco = 'exato',
    ajuste_incide = 'pacote',
    deslocamento_modelo = 'nenhum',
    deslocamento_km_gratis = 0,
    deslocamento_valor_km_centavos = 0
  where empresa_id = est;

  update public.empresas set
    slogan = 'Festas infantis com brilho, do convite ao último brigadeiro',
    sobre = 'Festas infantis com brinquedão, monitores e cardápio feito na hora.',
    diferenciais = array['Espaço próprio', 'Monitores', 'Brinquedão', 'Estacionamento'],
    onboarding_passo = 5,
    onboarding_iniciado_em = now() - interval '30 days',
    onboarding_concluido_em = now() - interval '30 days',
    link_testado_em = now() - interval '20 days',
    pagina_personalizada_em = now() - interval '20 days'
  where id = est;
end;
$$;

-- ---------------------------------------------------------------------------
-- Agenda de dezembro/2026 e os 6 leads do funil
-- ---------------------------------------------------------------------------
do $$
declare
  est   constant uuid := 'e5000000-0000-4000-8000-000000000001';
  dona  constant uuid := 'e5a00000-0000-4000-8000-000000000001';
  v_tipo   uuid;
  v_espaco uuid;
  v_fuso   text;
  v_interv integer;
  v_lead   uuid;
  v_orc    uuid;
  r        record;
begin
  perform set_config('orkestra.permitir_escrita', '1', true);
  select id into v_tipo from public.tipos_evento where empresa_id = est order by ordem limit 1;
  select id into v_espaco from public.espacos where empresa_id = est order by ordem limit 1;
  select e.fuso, rc.intervalo_entre_eventos_min into v_fuso, v_interv
  from public.empresas e join public.regras_comerciais rc on rc.empresa_id = e.id where e.id = est;

  -- reservas avulsas (clientes fictícios, sem lead): sábado 05/12 só à noite, e outros dias
  insert into public.reservas (
    empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status, cliente_nome,
    convidados, valor_total_centavos, sinal_centavos, sinal_pago_em, criado_por, confirmada_por,
    confirmada_em
  )
  select est, v_espaco, t.id, x.data, i.inicio, i.fim, 'confirmada', 'ativa', x.cliente,
         x.convidados, x.valor, x.valor * 3 / 10, current_date, dona, dona, now() - interval '10 days'
  from (values
    ('Noite',  date '2026-12-05', 'Festa da Helô', 60, 620000),
    ('Almoço', date '2026-12-06', 'Aniversário do Davi', 45, 480000),
    ('Tarde',  date '2026-12-12', 'Festa da Lara', 70, 690000),
    ('Almoço', date '2026-12-13', 'Batizado do Theo', 40, 430000),
    ('Tarde',  date '2026-12-20', 'Festa do Gael', 55, 600000)
  ) as x(turno, data, cliente, convidados, valor)
  join public.turnos t on t.empresa_id = est and t.nome = x.turno
  cross join lateral public._agenda_intervalo(x.data, t.hora_inicio, t.duracao_min, v_fuso, v_interv) i;

  insert into public.bloqueios (empresa_id, data, turno_id, espaco_id, motivo, criado_por) values
    (est, date '2026-12-24', null, null, 'Véspera de Natal', dona),
    (est, date '2026-12-25', null, null, 'Natal', dona),
    (est, date '2026-12-31', null, null, 'Réveillon', dona);

  for r in
    select * from (values
      (1, 'Carolina Alves', '+5534992000101', 'instagram', 'novo', 'frio', 3, interval '3 hours',
       'em_montagem', 'Tarde', date '2026-12-19', 40, null::integer, null::text, null::text),
      (2, 'Thiago Rocha', '+5534992000102', 'google', 'em_andamento', 'morno', 6, interval '1 day',
       'em_montagem', 'Almoço', date '2026-12-27', 35, null, null, null),
      (3, 'Luana Ferreira', '+5534992000103', 'indicacao', 'em_andamento', 'quente', 6, interval '6 hours',
       'visualizado', 'Tarde', date '2026-12-26', 50, 450000, null, null),
      (4, 'Renata Dias', '+5534992000104', 'whatsapp', 'pre_reservado', 'quente', 6, interval '5 hours',
       'aceito', 'Noite', date '2026-12-12', 60, 710000, 'pre_reserva', null),
      (5, 'Bruno Castro', '+5534992000105', 'instagram', 'reservado', 'quente', 6, interval '4 days',
       'aceito', 'Tarde', date '2026-12-19', 50, 555000, 'confirmada', null),
      (6, 'Paula Martins', '+5534992000106', 'qrcode', 'perdido', 'frio', 6, interval '6 days',
       'visualizado', 'Tarde', date '2026-12-13', 30, 340000, null, 'preco')
    ) as x(n, nome, whatsapp, origem, status, temperatura, passo, ha, status_orc, turno, data,
           convidados, total, reserva, perda)
  loop
    insert into public.leads (
      empresa_id, nome, whatsapp_e164, origem, status, temperatura, ultimo_passo,
      consentimento_em, consentimento_versao, consentimento_texto, ultima_atividade_em, criado_em,
      motivo_perda_codigo, perdido_em, status_antes_de_perder, primeiro_contato_em
    ) values (
      est, r.nome, r.whatsapp, r.origem::public.origem_lead, r.status::public.status_lead,
      r.temperatura::public.temperatura_lead, r.passo, now() - r.ha - interval '10 minutes',
      '2026-10-v1', 'Autorizo o buffet a usar meu nome e WhatsApp para enviar este orçamento.',
      now() - r.ha, now() - r.ha - interval '10 minutes',
      r.perda::public.motivo_perda, case when r.perda is not null then now() - r.ha + interval '2 days' end,
      case when r.perda is not null then 'em_andamento'::public.status_lead end,
      case when r.status <> 'novo' then now() - r.ha + interval '20 minutes' end
    ) returning id into v_lead;

    insert into public.orcamentos (
      empresa_id, lead_id, numero, token, status, canal, origem, rascunho, passo_atual,
      resultado, total_centavos, validade_ate, tipo_evento_id, data, turno_id, espaco_id,
      convidados, enviado_em, aceito_em, criado_em
    )
    select est, v_lead, r.n, 'seedVideoEstrela' || r.n || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
           r.status_orc::public.status_orcamento, 'publico', r.origem::public.origem_lead,
           jsonb_build_object('tipoEventoId', v_tipo, 'turnoId', t.id, 'adultos', r.convidados,
                              'criancas', '[]'::jsonb, 'opcionais', '[]'::jsonb, 'horasExtras', 0,
                              'data', r.data::text),
           r.passo,
           case when r.total is not null then jsonb_build_object(
             'versaoMotor', 1, 'ok', true, 'erros', '[]'::jsonb, 'avisos', '[]'::jsonb,
             'convidadosEquivalentes', r.convidados, 'pessoasFisicas', r.convidados,
             'linhas', '[]'::jsonb, 'subtotalCentavos', r.total, 'descontoCentavos', 0,
             'totalCentavos', r.total, 'porConvidadoCentavos', r.total / r.convidados,
             'sinalCentavos', r.total * 3 / 10, 'saldoCentavos', r.total - r.total * 3 / 10,
             'parcelas', '[]'::jsonb) end,
           r.total, case when r.total is not null then current_date + 15 end,
           v_tipo, r.data, t.id, v_espaco, r.convidados,
           case when r.total is not null then now() - r.ha end,
           case when r.status_orc = 'aceito' then now() - r.ha end,
           now() - r.ha - interval '8 minutes'
    from public.turnos t where t.empresa_id = est and t.nome = r.turno
    returning id into v_orc;

    if r.total is not null then
      insert into public.orcamento_itens (empresa_id, orcamento_id, ordem, tipo, descricao, quantidade,
        valor_unitario_centavos, subtotal_centavos, detalhe)
      values
        (est, v_orc, 0, 'pacote', 'Pacote Super', r.convidados, (r.total - 60000) / r.convidados,
         r.total - 60000, r.convidados || ' convidados equivalentes'),
        (est, v_orc, 1, 'opcional', 'Mesa temática', 1, 60000, 60000, 'Valor fixo');
    end if;

    insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, criado_em)
    values
      (est, v_lead, null, 'lead_criado', jsonb_build_object('origem', r.origem), 'cliente',
       now() - r.ha - interval '10 minutes'),
      (est, v_lead, v_orc, 'orcamento_iniciado', jsonb_build_object('numero', r.n), 'cliente',
       now() - r.ha - interval '8 minutes');
    if r.total is not null then
      insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, criado_em)
      values (est, v_lead, v_orc, 'orcamento_concluido',
              jsonb_build_object('total_centavos', r.total, 'data', r.data),
              'cliente', now() - r.ha - interval '2 minutes');
    end if;

    if r.reserva is not null then
      insert into public.reservas (
        empresa_id, espaco_id, turno_id, data, inicio, fim, tipo, status, expira_em, origem,
        cliente_nome, cliente_whatsapp_e164, tipo_evento_id, convidados, valor_total_centavos,
        sinal_centavos, sinal_pago_em, observacoes, lead_id, orcamento_id, confirmada_por,
        confirmada_em
      )
      select est, v_espaco, t.id, r.data, i.inicio, i.fim,
             r.reserva::public.tipo_reserva, 'ativa',
             -- vence depois da pré-reserva feita no vídeo: a nova (Mariana) fica no topo da caixa
             case when r.reserva = 'pre_reserva' then now() + interval '70 hours' end,
             'link_publico', r.nome, r.whatsapp, v_tipo, r.convidados, r.total,
             case when r.reserva = 'confirmada' then r.total * 3 / 10 end,
             case when r.reserva = 'confirmada' then current_date end,
             'Pré-reserva pelo link (orçamento nº ' || r.n || ').', v_lead, v_orc,
             case when r.reserva = 'confirmada' then dona end,
             case when r.reserva = 'confirmada' then now() - interval '3 days' end
      from public.turnos t
      cross join lateral public._agenda_intervalo(r.data, t.hora_inicio, t.duracao_min, v_fuso, v_interv) i
      where t.empresa_id = est and t.nome = r.turno;

      insert into public.atividades (empresa_id, lead_id, orcamento_id, tipo, dados, autor, criado_em)
      values (est, v_lead, v_orc, 'pre_reserva_pedida', jsonb_build_object('data', r.data),
              'cliente', now() - r.ha);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Plano ativo (sem a faixa do teste grátis no painel)
-- ---------------------------------------------------------------------------
insert into public.empresas_cobranca (empresa_id, nome, documento, email, asaas_cliente_id)
values ('e5000000-0000-4000-8000-000000000001', 'Camila Estrela', '52998224725',
        'dono@estrela.local', 'cus_seed_estrela');

insert into public.assinaturas (id, empresa_id, asaas_assinatura_id, plano_codigo, ciclo,
  valor_centavos, status, criada_em)
values ('e5b00000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001',
        'sub_seed_estrela', 'profissional', 'mensal', 24700, 'ativa', now() - interval '30 days');

insert into public.cobrancas (empresa_id, assinatura_id, asaas_cobranca_id, valor_centavos,
  vencimento, status, forma, link_fatura, pago_em)
values ('e5000000-0000-4000-8000-000000000001', 'e5b00000-0000-4000-8000-000000000001',
  'pay_seed_estrela_1', 24700, current_date - 5, 'recebida', 'PIX',
  'https://sandbox.asaas.com/i/pay_seed_estrela_1', (current_date - 5)::timestamptz);

select public._recalcular_assinatura('e5b00000-0000-4000-8000-000000000001');
select public.atualizar_situacoes();

commit;
