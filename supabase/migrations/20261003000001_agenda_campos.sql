-- Etapa 3 · Campos da agenda (só adições: compatível com o código da Etapa 2).

-- Quantos eventos o espaço atende ao mesmo tempo. Salão físico = 1; buffet em domicílio =
-- quantos eventos a equipe consegue atender em paralelo.
alter table public.espacos
  add column eventos_simultaneos integer not null default 1
    check (eventos_simultaneos between 1 and 50);

comment on column public.espacos.eventos_simultaneos is
  'Ocupações sobrepostas permitidas no espaço (capacidade de eventos, não de pessoas).';

-- Tempo de limpeza/montagem entre dois eventos do mesmo espaço, somado ao fim de cada evento.
alter table public.regras_comerciais
  add column intervalo_entre_eventos_min integer not null default 60
    check (intervalo_entre_eventos_min between 0 and 720);

comment on column public.regras_comerciais.intervalo_entre_eventos_min is
  'Minutos de limpeza e montagem depois de cada evento; entra no fim da reserva.';

grant update (intervalo_entre_eventos_min) on public.regras_comerciais to authenticated;
