/**
 * ClaraCore Service Worker — refuerzo de disponibilidad offline.
 * Importante: index.html y el documento de navegación usan red-primero
 * para que un F5 normal cargue el bundle nuevo tras un deploy;
 * el cache-first sobre el mismo CACHE_NAME dejaba la SPA “pegado” a JS viejo.
 */
const CACHE_NAME = 'claracore-shell-v6'
const TILES_CACHE_NAME = 'claracore-tiles-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== TILES_CACHE_NAME).map(k => caches.delete(k)),
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Favicon: nunca desde cache del SW (el navegador ya cachea bastante; evita icono “pegado” tras deploy)
  if (url.pathname === '/favicon.png' || /^\/favicon\.(ico|svg)$/.test(url.pathname)) {
    event.respondWith(fetch(event.request))
    return
  }

  // Tiles MapTiler — cache-first para mapa Leaflet offline (SICOE)
  if (url.hostname === 'api.maptiler.com') {
    event.respondWith(
      caches.open(TILES_CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) =>
          cached || fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone())
            }
            return response
          }),
        ),
      ),
    )
    return
  }

  // Llamadas a la API → siempre red (la app React decide qué hacer offline)
  if (url.pathname.startsWith('/api') ||
      url.hostname.includes('supabase') ||
      url.hostname !== self.location.hostname) {
    return // no interceptar
  }

  // Vite en desarrollo: no cachear módulos ni HMR
  if (url.pathname.startsWith('/@') ||
      url.pathname.startsWith('/src/') ||
      url.pathname.includes('/node_modules/')) {
    return
  }

  // Documentos (pestaña): red-primero, actualiza caché al éxito → despliegues visibles sin Ctrl+Shift+R
  if (event.request.mode === 'navigate' ||
      url.pathname === '/' ||
      url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone))
          }
          return response
        })
        .catch(() => caches.match('/index.html').then((c) => c || caches.match('/')))
    )
    return
  }

  // Chunks Vite (/assets/*.js, *.css): red-primero — evita index nuevo + maps-*.js viejo (404) tras deploy
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone))
          }
          return response
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // Otros assets del mismo origen: cache-first solo para GET (Cache API no admite POST)
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request))
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const netFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone))
          }
          return response
        })
        .catch(() => cached)
      return cached || netFetch
    })
  )
})
