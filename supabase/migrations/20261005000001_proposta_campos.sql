-- Etapa 5 · Campos da proposta completa, do orçamento interno e do rastreio de aberturas.
-- Tudo aditivo (colunas nullable ou com default): o código da Etapa 4 continua funcionando.
-- Os valores novos de enum ficam neste arquivo, separados das funções que os usam
-- (um valor novo de enum não pode ser usado na mesma transação em que foi criado).

-- ---------------------------------------------------------------------------
-- empresas: dados do rodapé da proposta (o dono edita na Identidade)
-- ---------------------------------------------------------------------------
alter table public.empresas
  add column razao_social    text check (razao_social is null or char_length(btrim(razao_social)) between 1 and 160),
  add column cnpj            text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  add column endereco        text check (endereco is null or char_length(btrim(endereco)) between 1 and 200),
  add column rodape_orkestra boolean not null default true;

comment on column public.empresas.cnpj is 'Só dígitos (14). O dígito verificador é validado no domínio (validacao/cnpj).';
comment on column public.empresas.rodape_orkestra is 'Mostra "feito com Orkestra". Fixo em true nesta etapa (o plano superior remove).';

grant update (razao_social, cnpj, endereco) on public.empresas to authenticated;

-- ---------------------------------------------------------------------------
-- tipos_evento: parágrafo de abertura da proposta (grant de update já é da tabela inteira)
-- ---------------------------------------------------------------------------
alter table public.tipos_evento
  add column texto_abertura text check (texto_abertura is null or char_length(texto_abertura) <= 600);

comment on column public.tipos_evento.texto_abertura is
  'Abertura da proposta. Variáveis: {nome}, {data}, {convidados}, {tipo}, {buffet}.';

-- Texto padrão só onde ainda não há texto (não sobrescreve nada que o dono escreveu).
update public.tipos_evento set texto_abertura =
  'Olá, {nome}! Preparamos com carinho a proposta para {tipo} no dia {data}, para {convidados} convidados. Confira abaixo tudo o que está incluso e as condições para garantir a sua data no {buffet}.'
where texto_abertura is null;

-- ---------------------------------------------------------------------------
-- regras_comerciais: política de alteração de convidados (aparece na proposta)
-- ---------------------------------------------------------------------------
alter table public.regras_comerciais
  add column alteracao_convidados_texto text not null default ''
    check (char_length(alteracao_convidados_texto) <= 1000);

grant update (alteracao_convidados_texto) on public.regras_comerciais to authenticated;

-- ---------------------------------------------------------------------------
-- orcamentos: orçamento interno, conteúdo congelado e rastreio
-- ---------------------------------------------------------------------------
alter table public.orcamentos
  add column criado_por            uuid references public.usuarios (id) on delete set null,
  add column observacoes           text check (observacoes is null or char_length(observacoes) <= 1000),
  add column observacoes_internas  text check (observacoes_internas is null or char_length(observacoes_internas) <= 1000),
  add column desconto_motivo       text check (desconto_motivo is null or char_length(desconto_motivo) <= 200),
  add column fora_antecedencia     boolean not null default false,
  add column aberturas             integer not null default 0 check (aberturas >= 0),
  add column ultima_abertura_em    timestamptz,
  add column conteudo              jsonb check (conteudo is null or jsonb_typeof(conteudo) = 'object'),
  add column pacote_id             uuid,
  add column canal_envio           text check (canal_envio is null or canal_envio in ('whatsapp', 'link', 'pdf'));

comment on column public.orcamentos.observacoes is 'Observações para o cliente (aparecem na proposta).';
comment on column public.orcamentos.observacoes_internas is 'NUNCA sai para o cliente (nem na proposta, nem no PDF).';
comment on column public.orcamentos.desconto_motivo is 'Interno: por que o desconto foi dado.';
comment on column public.orcamentos.conteudo is
  'Conteúdo congelado na conclusão: cardápio, convidados por faixa, textos de condições e políticas, abertura preenchida.';
comment on column public.orcamentos.pacote_id is 'Pacote escolhido (para impedir excluir pacote usado). Sem FK: o item congelado é a cópia.';

create index orcamentos_pacote_idx on public.orcamentos (pacote_id) where pacote_id is not null;

alter table public.orcamento_itens
  add column referencia_id uuid;

comment on column public.orcamento_itens.referencia_id is 'Pacote ou opcional de origem (só para saber se o item do catálogo foi usado).';

create index orcamento_itens_referencia_idx on public.orcamento_itens (referencia_id)
  where referencia_id is not null;

-- ---------------------------------------------------------------------------
-- Atividades novas da linha do tempo
-- ---------------------------------------------------------------------------
alter type public.tipo_atividade add value if not exists 'proposta_aberta';
alter type public.tipo_atividade add value if not exists 'proposta_enviada';
alter type public.tipo_atividade add value if not exists 'versao_criada';
alter type public.tipo_atividade add value if not exists 'orcamento_expirado';
alter type public.tipo_atividade add value if not exists 'orcamento_criado';

-- Limite de aberturas da proposta por IP (rastreio)
alter table publico.tentativas drop constraint if exists tentativas_acao_check;
alter table publico.tentativas add constraint tentativas_acao_check
  check (acao in ('iniciar', 'pre_reserva', 'visita', 'funil', 'abertura', 'pdf'));
