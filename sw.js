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

const FRANCE_BOUNDS = { minLat: 41.3, maxLat: 51.1, minLng: -5.2, maxLng: 9.6 };

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

// Fonction magique : calcule les coordonnées de la tuile au Zoom 10
function getParentTileUrl(baseUrl, x, y, z, targetZ = 10) {
  const factor = Math.pow(2, z - targetZ);
  const parentX = Math.floor(x / factor);
  const parentY = Math.floor(y / factor);
  return baseUrl.replace(new RegExp(`/${z}/${x}/${y}\\.png`), `/${targetZ}/${parentX}/${parentY}.png`);
}

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
          // 1. Si la tuile exacte est en cache (par ex: zoom 4 à 10), on la renvoie
          const cachedResponse = await cache.match(e.request);
          if (cachedResponse) return cachedResponse;

          // 2. Sinon, on tente de la récupérer sur le réseau (mode En Ligne -> Tuiles HD)
          try {
            const networkResponse = await fetch(e.request);
            if (networkResponse.status === 200) {
              // On sauvegarde en cache uniquement si c'est dans la plage France 4-10
              if (z >= 4 && z <= 10 && isTileInFrance(x, y, z)) {
                cache.put(e.request, networkResponse.clone());
              }
            }
            return networkResponse;
          } catch (err) {
            // 3. ÉCHEC RÉSEAU (Mode Hors-Ligne) ET Zoom > 10
            // On va chercher la tuile parent correspondant au Zoom 10 déjà stockée !
            if (z > 10) {
              const parentUrl = getParentTileUrl(url, x, y, z, 10);
              const parentCached = await cache.match(parentUrl);
              if (parentCached) return parentCached;
            }
            return cachedResponse; // Renvoie undefined / 404 si vraiment introuvable
          }
        })
      );
      return;
    }
  }

  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
