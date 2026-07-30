const CACHE_NAME = 'irve-roadbook-v1';
const MAP_CACHE_NAME = 'osm-tiles-cache-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'
];

// En-tête personnalisé pour respecter la politique des serveurs OSM
const CUSTOM_HEADERS = {
  'User-Agent': 'IRVERoadbookLive-PWA/1.0'
};

// ----------------------------------------------------------------------------
// INSTALLATION & ACTIVATION
// ----------------------------------------------------------------------------
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== MAP_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// ----------------------------------------------------------------------------
// INTERCEPTION DES REQUÊTES (FETCH & CACHE)
// ----------------------------------------------------------------------------
self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // Interception spécifique pour les tuiles de cartes (OSM.de ou OSM standard)
  if (url.includes('tile.openstreetmap.de') || url.includes('tile.openstreetmap.org')) {
    e.respondWith(
      caches.open(MAP_CACHE_NAME).then(async (cache) => {
        // 1. Stratégie Cache-First : Si la tuile a déjà été affichée, on la sert immédiatement
        const cachedResponse = await cache.match(e.request);
        if (cachedResponse) return cachedResponse;

        // 2. Sinon, on va la chercher sur le réseau et on la sauvegarde au passage
        try {
          const networkResponse = await fetch(e.request, { headers: CUSTOM_HEADERS });
          if (networkResponse.status === 200) {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          // Si le réseau échoue et pas de cache, retourne undefined (Leaflet gèrera le manque de tuile)
          return cachedResponse;
        }
      })
    );
    return;
  }

  // Comportement par défaut pour les ressources statiques de l'application (HTML, JS, CSS)
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
