import type { Metadata } from 'next';
import { RegrasFollowUp } from '@/components/app/empresa/regras-follow-up';
import { exigirSessao } from '@/server/auth/sessao';
import { carregarRegrasFollowUp } from '@/server/avisos/carregar';

export const metadata: Metadata = { title: 'Follow-up' };

/** As tarefas automáticas de acompanhamento que o Orkestra cria (e cancela) sozinho. */
export default async function FollowUpPage() {
  const usuario = await exigirSessao();
  const regras = await carregarRegrasFollowUp(usuario);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        O Orkestra cria a tarefa com a mensagem pronta para quem cuida do lead (ou para o dono, se
        não tiver responsável) e cancela sozinho quando ela não faz mais sentido. Nada é enviado ao
        cliente sem você.
      </p>
      <RegrasFollowUp regras={regras} podeEditar={usuario.perfil === 'dono'} />
    </div>
  );
}
