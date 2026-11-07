/**
 * ClaraCore Service Worker — arranque offline garantizado + Web Push + tiles MapTiler.
 *
 * Estrategia:
 * - install: precachea shell + assets del build (lista inyectada en el build).
 * - navigate y /assets/*: caché primero (arranque sin red); actualiza en segundo plano con red.
 * - Deploys: al haber internet se refresca la caché; el banner de nueva versión sigue activo.
 *
 * No modifica el modo offline de SicoeObra (solo tiles MapTiler cache-first).
 */
const CACHE_NAME = 'claracore-shell-v10'
const TILES_CACHE_NAME = 'claracore-tiles-v1'
const PRECACHE_MSG = 'CLARACORE_PRECACHE_URLS'

/** Reemplazado en build por la lista real de /assets/*; fallback mínimo en desarrollo. */
const SHELL_PRECACHE = self.__CLARACORE_PRECACHE__ || [
  '/',
  '/index.html',
  '/favicon.png',
  '/manifest.webmanifest',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          SHELL_PRECACHE.map((url) =>
            cache.add(url).catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== TILES_CACHE_NAME)
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.type !== PRECACHE_MSG || !Array.isArray(data.urls)) return
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const raw of data.urls) {
        try {
          let reqUrl = typeof raw === 'string' ? raw : ''
          if (!reqUrl) continue
          if (reqUrl.startsWith('http')) {
            const u = new URL(reqUrl)
            if (u.origin !== self.location.origin) continue
            reqUrl = u.href
          } else {
            reqUrl = new URL(reqUrl, self.location.origin).href
          }
          await cache.add(reqUrl).catch(() => undefined)
        } catch {
          /* ignore one URL */
        }
      }
    }),
  )
})

async function cacheFirst(request, { fallbackPaths = [] } = {}) {
  const cache = await caches.open(CACHE_NAME)
  const cached =
    (await cache.match(request)) ||
    (await cache.match(request, { ignoreSearch: true }))
  if (cached) {
    // Actualización en segundo plano (no bloquea el arranque offline)
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          cache.put(request, response.clone())
          if (request.mode === 'navigate' || new URL(request.url).pathname === '/') {
            cache.put('/index.html', response.clone())
          }
        }
      })
      .catch(() => {})
    return cached
  }

  try {
    const response = await fetch(request)
    if (response && response.ok) {
      cache.put(request, response.clone())
      if (request.mode === 'navigate') {
        cache.put('/index.html', response.clone())
      }
    }
    return response
  } catch {
    for (const p of fallbackPaths) {
      const fb = await cache.match(p)
      if (fb) return fb
    }
    return new Response('Sin conexión', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Tiles MapTiler — cache-first (SICOE offline mapa); no tocar lógica SICOE de datos
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

  // API / Supabase / otros orígenes → red (la app decide offline)
  if (url.pathname.startsWith('/api') ||
      url.hostname.includes('supabase') ||
      url.hostname !== self.location.hostname) {
    return
  }

  // Vite HMR en desarrollo
  if (url.pathname.startsWith('/@') ||
      url.pathname.startsWith('/src/') ||
      url.pathname.includes('/node_modules/')) {
    return
  }

  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request))
    return
  }

  // Poll de versión (index.html?_=…): red primero; sin red → shell en caché
  if (url.pathname === '/index.html' && url.searchParams.has('_')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((c) => {
              c.put('/index.html', response.clone())
              c.put('/', response.clone())
            })
          }
          return response
        })
        .catch(() =>
          caches.open(CACHE_NAME).then(async (c) => {
            const fb = (await c.match('/index.html')) || (await c.match('/'))
            return fb || new Response('Sin conexión', {
              status: 503,
              statusText: 'Offline',
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          }),
        ),
    )
    return
  }

  // Navegación / documento: caché primero → abre sin internet
  if (event.request.mode === 'navigate' ||
      url.pathname === '/' ||
      url.pathname === '/index.html') {
    event.respondWith(
      cacheFirst(event.request, { fallbackPaths: ['/index.html', '/'] }),
    )
    return
  }

  // JS/CSS del build y demás same-origin: caché primero
  if (url.pathname.startsWith('/assets/') ||
      url.pathname === '/favicon.png' ||
      url.pathname === '/manifest.webmanifest' ||
      url.pathname === '/sw.js') {
    // sw.js siempre red cuando hay red, para actualizar el worker; offline → caché
    if (url.pathname === '/sw.js') {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone()
              caches.open(CACHE_NAME).then((c) => c.put(event.request, clone))
            }
            return response
          })
          .catch(() => caches.match(event.request)),
      )
      return
    }
    event.respondWith(cacheFirst(event.request))
    return
  }

  event.respondWith(cacheFirst(event.request))
})

self.addEventListener('push', (event) => {
  let payload = { title: 'ClaraCore', body: '', url: '/' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'ClaraCore', {
      body: payload.body || '',
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: { url: payload.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
      return undefined
    }),
  )
})
