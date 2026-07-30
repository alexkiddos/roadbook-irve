const CACHE_NAME = 'irve-roadbook-v1';
const MAP_CACHE_NAME = 'osm-tiles-france-v1';

// Fichiers de base de l'application
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'
];

// Limites géographiques de la France Métropolitaine (Bounding Box)
const FRANCE_BOUNDS = {
  minLat: 41.3,
  maxLat: 51.1,
  minLng: -5.2,
  maxLng: 9.6
};

// Convertit les coordonnées de tuile OSM (x, y, z) en Latitude / Longitude
function tileToLatLon(x, y, z) {
  const n = Math.pow(2, z);
  const lonDeg = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const latDeg = (latRad * 180) / Math.PI;
  return { lat: latDeg, lng: lonDeg };
}

// Vérifie si une tuile fait partie de la France Métropolitaine
function isTileInFrance(x, y, z) {
  const { lat, lng } = tileToLatLon(x, y, z);
  return (
    lat >= FRANCE_BOUNDS.minLat &&
    lat <= FRANCE_BOUNDS.maxLat &&
    lng >= FRANCE_BOUNDS.minLng &&
    lng <= FRANCE_BOUNDS.maxLng
  );
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== MAP_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // Interception des tuiles OpenStreetMap
  if (url.includes('tile.openstreetmap.de') || url.includes('tile.openstreetmap.org')) {
    // Extraction de z, x, y depuis l'URL de la tuile (.../z/x/y.png)
    const match = url.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);

    if (match) {
      const z = parseInt(match[1], 10);
      const x = parseInt(match[2], 10);
      const y = parseInt(match[3], 10);

      // Condition : Uniquement pour la France ET entre le zoom 6 et 10
      const isFranceZoomRange = z >= 6 && z <= 10 && isTileInFrance(x, y, z);

      if (isFranceZoomRange) {
        e.respondWith(
          caches.open(MAP_CACHE_NAME).then(async (cache) => {
            const cachedResponse = await cache.match(e.request);
            if (cachedResponse) {
              return cachedResponse;
            }
            try {
              const networkResponse = await fetch(e.request);
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
    }
  }

  // Gestion réseau standard pour le reste des fichiers de l'app
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
