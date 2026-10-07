import { Logotipo } from '@/components/marca/logotipo';

/**
 * Fundo das telas de acesso: grade, brilhos limão que se movem devagar, o logotipo em contorno e
 * pontos subindo. Só CSS (classes ld-* e fa-* em globals.css), parado com movimento reduzido e
 * sem nada externo (a CSP não aceita vídeo de fora; um vídeo próprio entraria aqui).
 */
const PONTOS = [
  { x: '8%', t: '9s', d: '0s', s: 'size-1.5' },
  { x: '22%', t: '12s', d: '-4s', s: 'size-1' },
  { x: '37%', t: '10s', d: '-7s', s: 'size-2' },
  { x: '55%', t: '14s', d: '-2s', s: 'size-1' },
  { x: '68%', t: '11s', d: '-9s', s: 'size-1.5' },
  { x: '83%', t: '13s', d: '-5s', s: 'size-1' },
  { x: '93%', t: '9s', d: '-1s', s: 'size-2' },
];

export function FundoAcesso() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="ld-grade absolute inset-0" />
      <div className="ld-brilho absolute -top-48 -left-48 size-[44rem] rounded-full" />
      <div
        className="ld-brilho absolute -right-56 -bottom-56 size-[40rem] rounded-full opacity-70"
        style={{ animationDelay: '-7s' }}
      />
      <Logotipo
        titulo=""
        className="absolute top-1/2 left-1/2 w-[150vw] max-w-none -translate-x-1/2 -translate-y-1/2 text-transparent lg:w-[110vw] [&_path]:stroke-white/[0.045] [&_path]:[stroke-width:0.5]"
      />
      {PONTOS.map((p) => (
        <span
          key={p.x}
          className={`fa-ponto bg-primary absolute bottom-0 rounded-full shadow-[0_0_12px_2px_rgb(178_247_89/0.6)] ${p.s}`}
          style={{ left: p.x, ['--duracao' as string]: p.t, animationDelay: p.d }}
        />
      ))}
      {/* escurece as bordas para o cartão ficar no centro da atenção */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(0_0_0/0.65)_100%)]" />
    </div>
  );
}
