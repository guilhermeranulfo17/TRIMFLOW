-- Etapa 9.5 · Cor padrão do buffet: verde-petróleo #0F766E (AA com texto branco). O roxo
-- #7C5CD6 era o padrão antigo, que ninguém escolheu de propósito: quem ainda está nele passa para
-- o novo. Quem escolheu outra cor não muda. O limão é só do Orkestra (ARQUITETURA §59).
-- Aditiva e compatível com o código anterior (ele só lê a coluna).

alter table public.empresas alter column cor_marca set default '#0F766E';

update public.empresas set cor_marca = '#0F766E' where upper(cor_marca) = '#7C5CD6';
