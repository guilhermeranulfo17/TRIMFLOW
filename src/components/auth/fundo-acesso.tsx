import { VideoFundo } from './video-fundo';

/**
 * Fundo das telas de acesso: o vídeo da recepção do Orkestra (arquivo nosso em public/acesso;
 * a CSP só aceita mídia do próprio site), escurecido para o cartão ficar legível. No PC o escuro
 * fica à direita, onde está o formulário; no celular, por igual. Pontos limão subindo por cima.
 */
const PONTOS = [
  { x: '58%', t: '11s', d: '0s', s: 'size-1.5' },
  { x: '67%', t: '13s', d: '-4s', s: 'size-1' },
  { x: '76%', t: '10s', d: '-7s', s: 'size-2' },
  { x: '85%', t: '14s', d: '-2s', s: 'size-1' },
  { x: '94%', t: '12s', d: '-9s', s: 'size-1.5' },
];

export function FundoAcesso() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden bg-black">
      <VideoFundo className="absolute inset-0 size-full object-cover object-[38%_center] lg:object-[30%_center]" />
      {/* celular: escurece por igual; PC: claro à esquerda (a recepcionista), escuro à direita */}
      <div className="absolute inset-0 bg-black/70 lg:bg-transparent lg:bg-[linear-gradient(90deg,rgb(0_0_0/0.15)_0%,rgb(0_0_0/0.35)_45%,rgb(0_0_0/0.85)_75%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
      <div className="ld-brilho absolute -right-56 -bottom-56 size-[40rem] rounded-full opacity-60" />
      {PONTOS.map((p) => (
        <span
          key={p.x}
          className={`fa-ponto bg-primary absolute bottom-0 rounded-full shadow-[0_0_12px_2px_rgb(178_247_89/0.6)] ${p.s}`}
          style={{ left: p.x, ['--duracao' as string]: p.t, animationDelay: p.d }}
        />
      ))}
    </div>
  );
}
