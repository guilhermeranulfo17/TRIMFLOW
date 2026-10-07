import { describe, expect, it } from 'vitest';
import { TIPOS_AVISO, TIPOS_COM_EMAIL, recebeEmail } from '@/domain/avisos/canais';
import { escaparHtml, montarEmail } from '@/domain/email/modelos';

const SITE = 'https://orkestra.app';
const DADOS: Record<string, Record<string, unknown>> = {
  boas_vindas: { buffet: 'Buffet <Alegria>', slug: 'buffet-alegria' },
  teste_acabando: { dias: 3 },
  fatura_criada: {
    valor_centavos: 9700,
    vencimento: '2026-10-20',
    link_fatura: 'https://www.asaas.com/i/abc',
  },
  pagamento_confirmado: { valor_centavos: 9700 },
  pagamento_falhou: { valor_centavos: 9700, vencimento: '2026-10-20' },
  conta_suspensa: {},
  exportacao_pronta: {},
  exclusao_agendada: { exclusao_em: '2026-11-03T12:00:00Z' },
  contrato_assinado: {
    lead_nome: 'Ana <Lima>',
    contrato: '2026-0007',
    contrato_id: '7f1c6a2e-1b1a-4c55-9d3e-2a8f1e0c9b11',
  },
};

describe('modelos de e-mail', () => {
  it.each(TIPOS_COM_EMAIL)('%s renderiza assunto, HTML e texto com link absoluto', (tipo) => {
    const e = montarEmail(tipo, DADOS[tipo]!, { site: `${SITE}/`, fuso: 'America/Sao_Paulo' })!;
    expect(e.assunto.length).toBeGreaterThan(5);
    expect(e.html).toContain('<!doctype html>');
    expect(e.html).toContain('Orkestra');
    expect(e.html).toMatch(/href="https:\/\/orkestra\.app\//);
    expect(e.html).not.toContain('href="/');
    expect(e.texto).toContain(SITE);
    expect(e.html).not.toMatch(/undefined|null|NaN/);
    expect(e.texto).not.toMatch(/undefined|null|NaN/);
  });

  it('contrato assinado leva ao contrato no painel e escapa o nome', () => {
    const e = montarEmail('contrato_assinado', DADOS.contrato_assinado!, { site: SITE })!;
    expect(e.html).toContain(
      'https://orkestra.app/app/contratos/7f1c6a2e-1b1a-4c55-9d3e-2a8f1e0c9b11',
    );
    expect(e.html).toContain('Ana &lt;Lima&gt;');
    expect(e.assunto).toBe('Contrato assinado: Ana <Lima>');
  });

  it('boas-vindas leva o link do buffet e escapa o nome', () => {
    const e = montarEmail('boas_vindas', DADOS.boas_vindas!, { site: SITE })!;
    expect(e.html).toContain('https://orkestra.app/b/buffet-alegria');
    expect(e.html).toContain('Buffet &lt;Alegria&gt;');
    expect(e.html).not.toContain('<Alegria>');
  });

  it('fatura: botão vai para o link do Asaas (só https)', () => {
    const e = montarEmail('fatura_criada', DADOS.fatura_criada!, { site: SITE })!;
    expect(e.html).toContain('href="https://www.asaas.com/i/abc"');
    expect(e.html).toContain('R$ 97,00');
    const sem = montarEmail(
      'fatura_criada',
      { link_fatura: 'javascript:alert(1)' },
      { site: SITE },
    )!;
    expect(sem.html).not.toContain('javascript:');
    expect(sem.html).toContain('href="https://orkestra.app/app/empresa/plano"');
  });

  it('exclusão mostra a data no fuso da empresa', () => {
    const e = montarEmail('exclusao_agendada', DADOS.exclusao_agendada!, {
      site: SITE,
      fuso: 'America/Sao_Paulo',
    })!;
    expect(e.texto).toContain('03/11/2026');
  });

  it('avisos de lead nunca viram e-mail', () => {
    for (const t of TIPOS_AVISO.filter((x) => !recebeEmail(x))) {
      expect(montarEmail(t, {}, { site: SITE })).toBeNull();
    }
    expect(recebeEmail('pre_reserva_pedida')).toBe(false);
  });

  it('escaparHtml', () => {
    expect(escaparHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
