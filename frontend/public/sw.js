/**
 * ClaraCore Service Worker — arranque offline + Web Push + tiles MapTiler (SICOE).
 * index.html y /assets/*: red-primero cuando hay red (deploys visibles);
 * install precachea el shell mínimo; el cliente envía URLs de assets para precache.
 */
const CACHE_NAME = 'claracore-shell-v9'
const TILES_CACHE_NAME = 'claracore-tiles-v1'
const PRECACHE_MSG = 'CLARACORE_PRECACHE_URLS'

const SHELL_PRECACHE = [
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
          const url = typeof raw === 'string' ? raw : ''
          if (!url || url.startsWith('http') && !url.startsWith(self.location.origin)) {
            // same-origin path or absolute same origin only
            if (url.startsWith('http')) {
              const u = new URL(url)
              if (u.origin !== self.location.origin) continue
            }
          }
          const reqUrl = url.startsWith('http') ? url : new URL(url, self.location.origin).href
          await cache.add(reqUrl).catch(() => undefined)
        } catch {
          /* ignore one URL */
        }
      }
    }),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (url.pathname === '/favicon.png' || /^\/favicon\.(ico|svg)$/.test(url.pathname)) {
    event.respondWith(fetch(event.request))
    return
  }

  // Tiles MapTiler — cache-first para mapa Leaflet offline (SICOE); no tocar lógica SICOE
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

  if (url.pathname.startsWith('/api') ||
      url.hostname.includes('supabase') ||
      url.hostname !== self.location.hostname) {
    return
  }

  if (url.pathname.startsWith('/@') ||
      url.pathname.startsWith('/src/') ||
      url.pathname.includes('/node_modules/')) {
    return
  }

  if (event.request.mode === 'navigate' ||
      url.pathname === '/' ||
      url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((c) => {
              c.put('/index.html', clone.clone())
              c.put(event.request, clone)
            })
          }
          return response
        })
        .catch(() =>
          caches.match('/index.html').then((c) =>
            c || caches.match('/') || caches.match(event.request),
          ),
        ),
    )
    return
  }

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
        .catch(() => caches.match(event.request)),
    )
    return
  }

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
    }),
  )
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
