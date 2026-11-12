-- Página pública elegante (nov/2026, ARQUITETURA §84): modelo visual da página.
--
-- Tudo aditivo (funciona com o código da versão anterior):
-- - empresas.modelo_pagina: 'elegante' | 'alegre'; nulo = o mesmo modelo da proposta (que,
--   sem escolha, vem do tipo de buffet). A regra fica em domain/publico/pagina.
-- - salvar_pagina_publica aceita a chave "modelo" (mesma assinatura; sem a chave, nada muda).
-- - publico.pagina devolve modelo_pagina e modelo_proposta (o código anterior ignora).

alter table public.empresas add column if not exists modelo_pagina text;

alter table public.empresas drop constraint if exists empresas_modelo_pagina_valido;
alter table public.empresas add constraint empresas_modelo_pagina_valido
  check (modelo_pagina is null or modelo_pagina in ('elegante', 'alegre'));

comment on column public.empresas.modelo_pagina is
  'Modelo visual da página pública: elegante ou alegre. Nulo = o da proposta. Só por salvar_pagina_publica.';

-- ---------------------------------------------------------------------------
-- salvar_pagina_publica: igual à de 20261011000001, com a chave "modelo"
-- ---------------------------------------------------------------------------
create or replace function public.salvar_pagina_publica(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u      public.usuarios := public._pagina_dono();
  v_e      public.empresas;
  v_dif    text[];
  v_antes  jsonb;
  v_depois jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PAGINA_INVALIDA' using errcode = 'check_violation';
  end if;
  select * into v_e from public.empresas where id = v_u.empresa_id for update;
  if p ? 'diferenciais' then
    if jsonb_typeof(p -> 'diferenciais') <> 'array' then
      raise exception 'PAGINA_INVALIDA' using errcode = 'check_violation';
    end if;
    select coalesce(array_agg(btrim(d) order by n), '{}') into v_dif
    from jsonb_array_elements_text(p -> 'diferenciais') with ordinality as x(d, n)
    where btrim(d) <> '';
  end if;

  v_antes := jsonb_build_object('slogan', v_e.slogan, 'estilo', v_e.estilo,
    'diferenciais', to_jsonb(v_e.diferenciais), 'bairro', v_e.bairro, 'endereco', v_e.endereco,
    'mostrar_endereco', v_e.mostrar_endereco, 'modelo', v_e.modelo_pagina);

  update public.empresas set
    slogan = case when p ? 'slogan' then public._texto_ou_nulo(p ->> 'slogan') else slogan end,
    estilo = case when p ? 'estilo' then (public._texto_ou_nulo(p ->> 'estilo'))::public.estilo_pagina
                  else estilo end,
    diferenciais = case when p ? 'diferenciais' then v_dif else diferenciais end,
    bairro = case when p ? 'bairro' then public._texto_ou_nulo(p ->> 'bairro') else bairro end,
    endereco = case when p ? 'endereco' then public._texto_ou_nulo(p ->> 'endereco') else endereco end,
    mostrar_endereco = case when p ? 'mostrar_endereco' then coalesce((p ->> 'mostrar_endereco')::boolean, false)
                            else mostrar_endereco end,
    -- vazio = automático (nulo); valor fora da lista cai no check da coluna
    modelo_pagina = case when p ? 'modelo' then public._texto_ou_nulo(p ->> 'modelo') else modelo_pagina end,
    pagina_personalizada_em = coalesce(pagina_personalizada_em, now())
  where id = v_e.id
  returning jsonb_build_object('slogan', slogan, 'estilo', estilo, 'diferenciais', to_jsonb(diferenciais),
    'bairro', bairro, 'endereco', endereco, 'mostrar_endereco', mostrar_endereco,
    'modelo', modelo_pagina) into v_depois;

  if v_antes is distinct from v_depois then
    insert into public.auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados)
    values (v_e.id, v_u.id, 'pagina.textos_alterados', 'empresa', v_e.id,
            jsonb_build_object('antes', v_antes, 'depois', v_depois));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- publico.pagina: igual à de 20261011000001, com modelo_pagina e modelo_proposta
-- ---------------------------------------------------------------------------
create or replace function publico.pagina(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'segmento', e.segmento,
    'slogan', e.slogan,
    'estilo', e.estilo,
    'modelo_pagina', e.modelo_pagina,
    'modelo_proposta', e.modelo_proposta,
    'diferenciais', to_jsonb(e.diferenciais),
    'bairro', e.bairro,
    'endereco', case when e.mostrar_endereco then e.endereco end,
    'galeria', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'caminho_640', g.caminho_640, 'caminho_1280', g.caminho_1280,
        'largura', g.largura, 'altura', g.altura, 'blur', g.blur, 'alt', g.alt) order by g.ordem)
      from public.galeria_fotos g where g.empresa_id = e.id), '[]'),
    'depoimentos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'nome', d.nome, 'tipo_festa', d.tipo_festa, 'texto', d.texto) order by d.ordem)
      from public.depoimentos d where d.empresa_id = e.id), '[]'),
    'perguntas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'pergunta', f.pergunta, 'resposta', f.resposta) order by f.ordem)
      from public.perguntas_frequentes f where f.empresa_id = e.id), '[]'))
  from public.empresas e
  where e.slug = lower(btrim(coalesce(p_slug, '')));
$$;
