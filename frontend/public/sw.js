/**
 * ClaraCore Service Worker — cachea el app shell para que la app
 * abra sin conexión. Las llamadas a la API son manejadas por el
 * código React (no por el SW), para que IndexedDB controle los datos.
 */
const CACHE_NAME = 'claracore-shell-v1'

// Archivos del app shell (Vite los genera con hashes; usamos la raíz)
const SHELL_URLS = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Llamadas a la API → siempre red (la app React decide qué hacer offline)
  if (url.pathname.startsWith('/api') ||
      url.hostname.includes('supabase') ||
      url.hostname !== self.location.hostname) {
    return // no interceptar
  }

  // Navegación y assets del app shell → cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached
      return fetch(event.request).then(response => {
        // Guardar respuestas exitosas de navegación en cache
        if (response.ok && event.request.mode === 'navigate') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone))
        }
        return response
      }).catch(() => {
        // Sin red y sin cache: devolver index.html para SPA routing
        return caches.match('/index.html')
      })
    })
  )
})
