import { Bricolage_Grotesque, Instrument_Serif } from 'next/font/google';

/*
 * Fontes da landing: só o peso e o estilo usados (títulos em Bricolage Grotesque ExtraBold e a
 * palavra de destaque em Instrument Serif itálico), subset latin, hospedadas pelo próprio site.
 */
const titulo = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: '800',
  display: 'swap',
  variable: '--font-ld-titulo',
});
const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: 'italic',
  display: 'swap',
  variable: '--font-ld-serif',
});

/** Landing: preto e off-white da marca (tokens de [data-landing] em globals.css). */
export default function LayoutMarketing({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-landing
      className={`bg-background text-foreground min-h-dvh ${titulo.variable} ${serif.variable}`}
    >
      {children}
    </div>
  );
}
