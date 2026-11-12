-- Espelho de uma migration aplicada direto em produção em 12/11/2026, fora do repositório
-- (registrada em supabase_migrations.schema_migrations com esta versão e este nome). O arquivo
-- existe para o histórico do repositório bater com o do banco: sem ele, `supabase db push`
-- recusa qualquer migration nova. O SQL é exatamente o que foi aplicado.
--
-- Atenção (docs/PROXIMOS_PASSOS.md, Etapa 9.5 PR 1): o SET em _lead_grupo/_lead_ordem impede o
-- inlining dessas funções e deixa a caixa de leads mais lenta (5.000 leads: de 38 para 65 ms).
alter function public._lead_ordem set search_path = public; alter function public._lead_grupo set search_path = public; alter function public._funil_etapa set search_path = public;
