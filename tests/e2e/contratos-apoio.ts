import { expect, type Browser, type Page } from '@playwright/test';
import { noBanco } from './banco';

/* Apoio dos E2E do contrato (Etapa 10): orçamento aceito próprio, envio pelo dono e o cliente. */

export const CPF = '529.982.247-25';
export const API_FALSA = 'http://localhost:4010';

export async function cliente(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    isMobile: true,
    hasTouch: true,
  });
  return ctx.newPage();
}

/**
 * Um cliente novo com um orçamento aceito, copiado de um do Buffet Demo: cada teste (e cada
 * repetição em paralelo) tem o seu, então ninguém muda o e-mail do outro.
 */
export async function orcamentoAceito(email: string | null): Promise<{ id: string; nome: string }> {
  return noBanco(async (sql) => {
    const sufixo = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
    const nome = `Cliente Contrato ${sufixo}`;
    const [o] = await sql<{ id: string }[]>`
      with base as (
        select o.* from public.orcamentos o
        join public.empresas e on e.id = o.empresa_id
        join public.leads l on l.id = o.lead_id
        where e.slug = 'buffet-demo' and o.status = 'aceito' and not l.eh_teste
          and o.resultado is not null
        order by o.criado_em limit 1
      ), lead as (
        insert into public.leads (empresa_id, nome, whatsapp_e164, email, origem, status)
        select b.empresa_id, ${nome}, ${'+55349' + sufixo}, ${email}, 'link_direto', 'pre_reservado'
        from base b returning id
      )
      insert into public.orcamentos
      select (jsonb_populate_record(null::public.orcamentos, to_jsonb(b) || jsonb_build_object(
        'id', gen_random_uuid(), 'lead_id', l.id, 'numero', 800000 + ${Number(sufixo) % 100000},
        'versao', 1, 'token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
      ))).*
      from base b, lead l
      returning id`;
    return { id: o!.id, nome };
  });
}

/** Dono gera e envia; devolve o link do cliente. */
export async function enviarContrato(
  page: Page,
  orcamentoId: string,
  exigirCodigo: boolean,
  o: { copiaEmail?: boolean } = {},
) {
  await page.goto(`/app/contratos/novo?orcamento=${orcamentoId}`);
  await expect(page.getByTestId('aviso-modelo')).toContainText('advogado');
  await expect(page.getByTestId('previa-contrato')).toContainText('CONTRATANTE');
  // completa o que o orçamento não trouxe (ex.: CNPJ, endereço do buffet)
  for (const campo of await page.locator('[data-variavel]').all()) {
    if (!(await campo.inputValue())) await campo.fill('Informação de teste');
  }
  const codigo = page.getByRole('checkbox', { name: /Exigir código por e-mail/ });
  if ((await codigo.isEnabled()) && (await codigo.isChecked()) !== exigirCodigo) {
    await codigo.click();
  }
  const copia = page.getByTestId('copia-email');
  if ((await copia.isEnabled()) && (await copia.isChecked()) !== (o.copiaEmail ?? false)) {
    await copia.click();
  }
  await page.getByTestId('enviar-contrato').click();
  await expect(page.getByTestId('contrato-enviado')).toBeVisible();
  return (await page.getByTestId('link-contrato').getAttribute('href'))!;
}

export async function preencherAssinatura(c: Page, nome: string) {
  await c.getByLabel('Nome completo').fill(nome);
  await c.getByLabel('CPF').fill(CPF);
  await expect(c.getByLabel('CPF')).toHaveValue(CPF);
  await c.getByLabel('Li e concordo com este contrato.').check();
}
