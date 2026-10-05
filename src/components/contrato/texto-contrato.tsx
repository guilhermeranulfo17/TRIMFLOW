import { blocosDoTexto, trechosComFalta } from '@/domain/contratos/documento';

/*
 * Texto do contrato na web (página do cliente e prévia do painel). Mesmo formato do PDF:
 * "# título", "## cláusula", "- item" e parágrafos. Na prévia, o que falta aparece destacado.
 */

function Trechos({ texto, rotulos }: { texto: string; rotulos?: Record<string, string> }) {
  if (!rotulos) return <>{texto}</>;
  return (
    <>
      {trechosComFalta(texto).map((t, i) =>
        t.falta ? (
          <mark
            key={i}
            className="bg-alerta/15 text-alerta border-alerta/40 rounded border px-1 font-semibold"
            data-falta={t.falta}
          >
            {rotulos[t.falta] ?? t.falta}
          </mark>
        ) : (
          <span key={i}>{t.texto}</span>
        ),
      )}
    </>
  );
}

export function TextoContrato({
  texto,
  rotulosFalta,
  className = '',
}: {
  texto: string;
  /** só na prévia do painel: nome da variável → rótulo para destacar o que falta */
  rotulosFalta?: Record<string, string>;
  className?: string;
}) {
  return (
    <div className={`text-[1.0625rem] leading-relaxed ${className}`} data-testid="texto-contrato">
      {blocosDoTexto(texto).map((b, i) => {
        switch (b.tipo) {
          case 'titulo':
            return (
              <h2 key={i} className="font-titulo mb-4 text-center text-xl font-extrabold">
                <Trechos texto={b.texto} rotulos={rotulosFalta} />
              </h2>
            );
          case 'clausula':
            return (
              <h3
                key={i}
                className="mt-6 mb-2 text-base font-bold text-[var(--marca-destaque,inherit)]"
              >
                <Trechos texto={b.texto} rotulos={rotulosFalta} />
              </h3>
            );
          case 'lista':
            return (
              <ul key={i} className="mb-3 list-disc space-y-1 pl-6">
                {b.itens.map((it, j) => (
                  <li key={j}>
                    <Trechos texto={it} rotulos={rotulosFalta} />
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i} className="mb-3">
                <Trechos texto={b.texto} rotulos={rotulosFalta} />
              </p>
            );
        }
      })}
    </div>
  );
}
