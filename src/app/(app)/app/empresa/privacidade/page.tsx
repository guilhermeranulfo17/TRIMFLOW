import type { Metadata } from 'next';
import Link from 'next/link';
import { ExclusaoConta, RetencaoLeads } from '@/components/app/empresa/privacidade';
import { Secao } from '@/components/app/form/secao';
import { formatData } from '@/domain/dates';
import { exigirPerfil } from '@/server/auth/guards';
import { carregarPrivacidade } from '@/server/lgpd/carregar';

export const metadata: Metadata = { title: 'Privacidade e dados' };

const LINK = 'text-primary-texto font-semibold underline-offset-4 hover:underline';

/** LGPD da empresa (Etapa 9B): guarda dos leads, exportação completa e exclusão da conta. */
export default async function PrivacidadePage() {
  const dono = await exigirPerfil('dono');
  const dados = await carregarPrivacidade(dono);
  const fuso = dono.empresa.fuso;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Pela LGPD, o seu buffet é o <strong>controlador</strong> dos dados dos clientes (leads) e o
        Orkestra é o <strong>operador</strong>: guardamos e tratamos os dados só para o seu buffet
        usar o sistema. Leia a{' '}
        <Link href="/privacidade" className={LINK}>
          Política de Privacidade
        </Link>
        , os{' '}
        <Link href="/termos" className={LINK}>
          Termos de Uso
        </Link>{' '}
        (com o acordo de tratamento de dados) e a lista de{' '}
        <Link href="/subprocessadores" className={LINK}>
          subprocessadores
        </Link>
        .
      </p>

      <RetencaoLeads meses={dados.retencaoMeses} />

      <Secao
        titulo="Exportar todos os dados"
        descricao="Um arquivo ZIP com uma planilha (CSV) por tabela: leads, orçamentos, reservas, catálogo, usuários, faturas e auditoria."
      >
        <a
          href="/app/empresa/privacidade/exportar"
          download
          className="bg-primary text-primary-foreground rounded-botao inline-flex min-h-11 w-fit items-center px-4 text-sm font-semibold"
          data-testid="exportar-empresa"
        >
          Baixar meus dados (ZIP)
        </a>
      </Secao>

      <ExclusaoConta
        agendadaPara={
          dados.exclusaoAgendadaPara ? formatData(dados.exclusaoAgendadaPara, fuso) : null
        }
      />
    </div>
  );
}
