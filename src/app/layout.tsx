import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Orkestra', template: '%s · Orkestra' },
  description: 'Orçamento self-service para buffets de festas.',
  // painel instalável (PWA): no iPhone, o push só funciona com o app na tela inicial
  appleWebApp: { capable: true, title: 'Orkestra', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#7C5CD6',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={manrope.variable}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
