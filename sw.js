const CACHE_NAME = 'irve-roadbook-v1';
const MAP_CACHE_NAME = 'osm-tiles-france-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'
];

// Limites géographiques de la France métropolitaine
const FRANCE_BOUNDS = { minLat: 41.3, maxLat: 51.1, minLng: -5.2, maxLng: 9.6 };

// Utilitaire pour créer une pause entre les requêtes
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function tileToLatLon(x, y, z) {
  const n = Math.pow(2, z);
  const lonDeg = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const latDeg = (latRad * 180) / Math.PI;
  return { lat: latDeg, lng: lonDeg };
}

function isTileInFrance(x, y, z) {
  const { lat, lng } = tileToLatLon(x, y, z);
  return (
    lat >= FRANCE_BOUNDS.minLat && lat <= FRANCE_BOUNDS.maxLat &&
    lng >= FRANCE_BOUNDS.minLng && lng <= FRANCE_BOUNDS.maxLng
  );
}

function getParentTileUrl(baseUrl, x, y, z, targetZ = 10) {
  const factor = Math.pow(2, z - targetZ);
  const parentX = Math.floor(x / factor);
  const parentY = Math.floor(y / factor);
  return baseUrl.replace(new RegExp(`/${z}/${x}/${y}\\.png`), `/${targetZ}/${parentX}/${parentY}.png`);
}

// ----------------------------------------------------------------------------
// INSTALLATION & ACTIVATION DU SERVICE WORKER
// ----------------------------------------------------------------------------
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME && key !== MAP_CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

// ----------------------------------------------------------------------------
// RÉCEPTION DU MESSAGE DE PRÉ-CHARGEMENT (FOND DE CARTE FRANCE ZOOM 4 À 10)
// ----------------------------------------------------------------------------
self.addEventListener('message', async (event) => {
  if (event.data && event.data.action === 'PRECACHE_TILES') {
    const urls = event.data.urls;
    const cache = await caches.open(MAP_CACHE_NAME);
    let downloaded = 0;
    let errors = 0;
    const total = urls.length;

    const sendLog = (msg, isErr = false) => {
      self.clients.matchAll().then((clients) => {
        clients.forEach((c) => c.postMessage({ type: 'TILE_LOG', message: msg, isError: isErr }));
      });
    };

    sendLog(`📦 Téléchargement progressif d'OSM German (${total} tuiles)...`);

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      try {
        const cached = await cache.match(url);
        if (!cached) {
          let resp = await fetch(url);

          // Si le serveur OSM signale une surcharge (429 Too Many Requests)
          if (resp.status === 429) {
            sendLog(`⚠️ Surcharge OSM détectée. Pause de 3 secondes...`, true);
            await delay(3000);
            resp = await fetch(url); // Deuxième tentative
          }

          if (resp.status === 200) {
            await cache.put(url, resp);
          } else {
            errors++;
          }
        }
      } catch (err) {
        errors++;
      } finally {
        downloaded++;
      }

      // Pause de 80ms entre chaque tuile (~12 tuiles/sec max pour respecter le serveur OSM)
      await delay(80);

      // Notification dans les logs tous les 5% de progression
      if (downloaded % Math.floor(total / 20) === 0 || downloaded === total) {
        const pct = Math.round((downloaded / total) * 100);
        sendLog(`🗺️ Carte OSM German : ${pct}% (${downloaded}/${total}) - Échecs : ${errors}`);
      }
    }

    if (errors > 0) {
      sendLog(`⚠️ Téléchargement terminé : ${downloaded - errors} tuiles enregistrées, ${errors} échecs (seront récupérées au prochain lancement).`);
    } else {
      sendLog(`✅ Carte de France OSM German 100% enregistrée en local !`);
    }
  }
});

// ----------------------------------------------------------------------------
// INTERCEPTION DES REQUÊTES HTTP (INTERCEPTOR / FETCH)
// ----------------------------------------------------------------------------
self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  if (url.includes('tile.openstreetmap.de') || url.includes('tile.openstreetmap.org')) {
    const match = url.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);

    if (match) {
      const z = parseInt(match[1], 10);
      const x = parseInt(match[2], 10);
      const y = parseInt(match[3], 10);

      e.respondWith(
        caches.open(MAP_CACHE_NAME).then(async (cache) => {
          const cachedResponse = await cache.match(e.request);
          if (cachedResponse) return cachedResponse;

          try {
            const networkResponse = await fetch(e.request);
            if (networkResponse.status === 200) {
              if (z >= 4 && z <= 10 && isTileInFrance(x, y, z)) {
                cache.put(e.request, networkResponse.clone());
              }
            }
            return networkResponse;
          } catch (err) {
            // Fallback hors-ligne : si zoom > 10, tenter d'afficher la tuile parente zoom 10
            if (z > 10) {
              const parentUrl = getParentTileUrl(url, x, y, z, 10);
              const parentCached = await cache.match(parentUrl);
              if (parentCached) return parentCached;
            }
            return cachedResponse;
          }
        })
      );
      return;
    }
  }

  // Comportement par défaut pour le reste des fichiers de l'application
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
