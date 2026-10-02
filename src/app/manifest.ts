import type { MetadataRoute } from 'next';

/*
 * PWA do painel: instalável na tela inicial (no iPhone, o push só funciona com o app
 * instalado, iOS 16.4+). Sem cache offline nesta etapa: o service worker (public/sw.js) só
 * recebe push e abre o lead ao tocar na notificação.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Orkestra',
    short_name: 'Orkestra',
    description: 'Leads, agenda e avisos do seu buffet.',
    start_url: '/app/leads',
    scope: '/',
    display: 'standalone',
    background_color: '#0c0c0c',
    theme_color: '#0c0c0c',
    lang: 'pt-BR',
    icons: [
      { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icones/icone-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
