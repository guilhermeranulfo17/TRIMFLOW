import { formatarMinutos, type LinhaAtendimento } from '@/domain/numeros';
import { Bloco } from './comum';

/** Tempo mediano até a primeira ação, por vendedor (o dono vê todos). */
export function Atendimento({
  total,
  porVendedor,
  nomes,
}: {
  total: LinhaAtendimento;
  porVendedor: LinhaAtendimento[];
  nomes: Map<string, string>;
}) {
  return (
    <Bloco
      titulo="Atendimento"
      descricao="Tempo até a primeira ação depois de uma pré-reserva ou pedido de visita (mediana)."
      testid="atendimento"
    >
      <p className="text-sm">
        Geral: <strong className="tabular-nums">{formatarMinutos(total.medianaMin)}</strong> desde o
        pedido · <strong className="tabular-nums">{formatarMinutos(total.medianaAvisoMin)}</strong>{' '}
        desde o aviso
        {total.semContato > 0 && (
          <span className="text-amber-300"> · {total.semContato} ainda sem contato</span>
        )}
      </p>
      {porVendedor.length > 0 && (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-1 py-1 font-medium">Responsável</th>
                <th className="px-1 py-1 text-right font-medium">Pedidos</th>
                <th className="px-1 py-1 text-right font-medium">Mediana</th>
                <th className="px-1 py-1 text-right font-medium">Sem contato</th>
              </tr>
            </thead>
            <tbody>
              {porVendedor.map((l) => (
                <tr key={l.responsavelId ?? 'sem'} className="border-t">
                  <td className="px-1 py-2">
                    {l.responsavelId
                      ? (nomes.get(l.responsavelId) ?? 'Usuário')
                      : 'Sem responsável'}
                  </td>
                  <td className="px-1 py-2 text-right tabular-nums">{l.acoes}</td>
                  <td className="px-1 py-2 text-right tabular-nums">
                    {formatarMinutos(l.medianaMin)}
                  </td>
                  <td className="px-1 py-2 text-right tabular-nums">{l.semContato}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Bloco>
  );
}
