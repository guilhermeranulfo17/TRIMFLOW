/*
 * Service worker do Orkestra (Etapa 7). Só push e clique na notificação: sem cache offline.
 * O payload vem de src/server/avisos/canais/push.ts: { titulo, corpo, url, tag }.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { titulo: 'Orkestra', corpo: event.data ? event.data.text() : '' };
  }
  const titulo = dados.titulo || 'Orkestra';
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || '',
      icon: '/icones/icone-192.png',
      badge: '/icones/icone-192.png',
      tag: dados.tag || undefined,
      data: { url: dados.url || '/app/leads' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL(
    (event.notification.data && event.notification.data.url) || '/app/leads',
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const janela of janelas) {
        if (new URL(janela.url).origin === self.location.origin && 'focus' in janela) {
          await janela.focus();
          if ('navigate' in janela) return janela.navigate(destino);
          return undefined;
        }
      }
      return self.clients.openWindow(destino);
    })(),
  );
});
