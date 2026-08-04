const CACHE_NAME = 'irve-roadbook-v2';
const MAP_CACHE_NAME = 'osm-tiles-cache-v1';
const SHARED_CACHE_NAME = 'incoming-shared-files';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'
];

const CUSTOM_HEADERS = {
  'User-Agent': 'IRVERoadbookLive-PWA/1.0'
};

// INSTALLATION
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS.map(asset => cache.add(asset))
      );
    })
  );
  self.skipWaiting();
});

// ACTIVATION
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== MAP_CACHE_NAME && key !== SHARED_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// INTERCEPTION DES REQUÊTES (FETCH)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // --- TRAITEMENT DU PARTAGE DE FICHIER (Web Share Target API) ---
  if (e.request.method === 'POST' && url.searchParams.get('shared') === 'true') {
    e.respondWith(
      (async () => {
        try {
          const formData = await e.request.formData();
          const sharedFile = formData.get('gpx_file');

          if (sharedFile) {
            const cache = await caches.open(SHARED_CACHE_NAME);
            // Stocke la réponse binaire du fichier partagé
            await cache.put('/shared-trace-file', new Response(sharedFile, {
              headers: {
                'content-type': sharedFile.type || 'application/octet-stream',
                'x-file-name': encodeURIComponent(sharedFile.name)
              }
            }));
          }
        } catch (err) {
          console.error("Erreur lors de la réception du fichier partagé :", err);
        }
        // Redirection vers l'application principale avec le flag ?shared=true
        return Response.redirect('./index.html?shared=true', 303);
      })()
    );
    return;
  }

  // --- GESTION DE LA CARTE OSM ---
  if (url.hostname.includes('tile.openstreetmap.de') || url.hostname.includes('tile.openstreetmap.org')) {
    e.respondWith(
      caches.open(MAP_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(e.request);
        if (cachedResponse) return cachedResponse;

        try {
          const networkResponse = await fetch(e.request, { headers: CUSTOM_HEADERS });
          if (networkResponse.status === 200) {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          return cachedResponse;
        }
      })
    );
    return;
  }

  // --- REQUÊTES DIVERSES EN CACHE FIRST / NETWORK FALLBACK ---
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
