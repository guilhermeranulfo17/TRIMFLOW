import type { Metadata } from 'next';
import Link from 'next/link';
import { dataDaVersao, VERSAO_DOCUMENTOS } from '@/domain/legal/versao';

export const metadata: Metadata = {
  title: 'Subprocessadores',
  description: 'Empresas que ajudam o Orkestra a operar o serviço e quais dados cada uma trata.',
};

/** Revisado pelo advogado (outubro de 2026). Provedor novo entra aqui e na Privacidade. */
const LISTA = [
  {
    nome: 'Supabase',
    para: 'Banco de dados, login e armazenamento das fotos',
    dados: 'Todos os dados do serviço (buffets, equipes e leads)',
    onde: 'Brasil (São Paulo); empresa nos EUA',
  },
  {
    nome: 'Vercel',
    para: 'Hospedagem do site e do painel',
    dados: 'Dados em trânsito e registros técnicos de acesso',
    onde: 'Funções em São Paulo; rede global; empresa nos EUA',
  },
  {
    nome: 'Asaas',
    para: 'Cobrança da assinatura (boleto, Pix, cartão) e notas',
    dados: 'Nome ou razão social, CPF/CNPJ e e-mail de cobrança do buffet',
    onde: 'Brasil',
  },
  {
    nome: 'Resend',
    para: 'Envio dos e-mails do serviço',
    dados: 'E-mail e nome de quem recebe, conteúdo do e-mail',
    onde: 'EUA',
  },
  {
    nome: 'Sentry',
    para: 'Registro de erros técnicos',
    dados: 'Dados técnicos do erro, sem nome, telefone, e-mail, IP nem dados de leads',
    onde: 'EUA',
  },
  {
    nome: 'Meta (WhatsApp Business Platform)',
    para: 'Avisos no WhatsApp da equipe do buffet (quando ligados)',
    dados: 'WhatsApp de quem recebe e o texto do aviso',
    onde: 'EUA e outros países',
  },
  {
    nome: 'Google',
    para: 'Login com a conta Google (opcional)',
    dados: 'Nome e e-mail da conta Google de quem entra',
    onde: 'EUA e outros países',
  },
];

export default function Subprocessadores() {
  return (
    <>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Subprocessadores</h1>
      <p className="text-muted-foreground text-sm">
        Versão {VERSAO_DOCUMENTOS}, publicada em {dataDaVersao()}
      </p>
      <p>
        Empresas que ajudam o Orkestra a operar o serviço e podem tratar dados pessoais em nome dos
        buffets. Avisamos os donos antes de incluir uma nova. Detalhes na{' '}
        <Link href="/privacidade">Política de Privacidade</Link> e no acordo de tratamento de dados
        dos <Link href="/termos#acordo-de-tratamento">Termos de uso</Link>.
      </p>
      <div className="mt-6 flex flex-col gap-4" data-testid="lista-subprocessadores">
        {LISTA.map((s) => (
          <section key={s.nome} className="rounded-card border p-4">
            <h2 className="!mt-0 text-base font-bold">{s.nome}</h2>
            <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted-foreground">Para quê</dt>
              <dd>{s.para}</dd>
              <dt className="text-muted-foreground">Quais dados</dt>
              <dd>{s.dados}</dd>
              <dt className="text-muted-foreground">Onde</dt>
              <dd>{s.onde}</dd>
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}
