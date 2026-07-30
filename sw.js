const CACHE_NAME = 'irve-roadbook-v1';

// Liste des ressources indispensables pour que l'application s'ouvre hors-ligne
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  // Fichiers externes CDN (Leaflet & PapaParse)
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'
];

// 1. Installation du Service Worker et mise en cache des fichiers
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Mise en cache des ressources statiques');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Nettoyage des anciens caches lors de la mise à jour
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Suppression de l\'ancien cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Interception des requêtes réseau (Priorité au Cache, puis au Réseau)
self.addEventListener('fetch', (event) => {
  // On ne tente pas de mettre en cache les requêtes de données dynamiques (Qualicharge, API data.gouv)
  if (event.request.url.includes('data.gouv.fr')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // Retourne le fichier depuis le cache s'il existe
      }
      return fetch(event.request); // Sinon, va le chercher sur Internet
    })
  );
});
