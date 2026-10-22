// Service worker minimal : permet l'installation de l'application.
// Pas de cache : les données viennent toujours du serveur pour rester à jour.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
