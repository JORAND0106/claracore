/**
 * Regresiones de consola en búsqueda Por reporte / PWA / offline.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const pub = join(root, '../public')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('consola: icono / offline clone / planilla / pizarra', () => {
  it('manifest declara iconos 192 y 512 con archivos dedicados', () => {
    const man = JSON.parse(readFileSync(join(pub, 'manifest.webmanifest'), 'utf8'))
    const sizes = man.icons.map((i) => i.sizes)
    assert.ok(sizes.includes('192x192'))
    assert.ok(sizes.includes('512x512'))
    assert.ok(man.icons.every((i) => !String(i.src).includes('favicon.png')))
    const i192 = readFileSync(join(pub, 'icon-192.png'))
    const i512 = readFileSync(join(pub, 'icon-512.png'))
    assert.ok(i192.length > 100)
    assert.ok(i512.length > 100)
  })

  it('SW clona index.html sync antes de caches.open', () => {
    const sw = readFileSync(join(pub, 'sw.js'), 'utf8')
    assert.match(sw, /claracore-shell-v13/)
    const idx = sw.indexOf("pathname === '/index.html' && url.searchParams.has('_')")
    assert.ok(idx > 0)
    const slice = sw.slice(idx, idx + 900)
    assert.match(slice, /const forIndex = response\.clone\(\)/)
    assert.match(slice, /const forRoot = response\.clone\(\)/)
    assert.match(slice, /caches\.open\(CACHE_NAME\)\.then/)
    // clone debe aparecer antes del then de caches.open en ese bloque
    assert.ok(slice.indexOf('forIndex') < slice.indexOf('caches.open(CACHE_NAME).then'))
  })

  it('carpeta no consulta planilla sin flag tiene_planilla_topografia', () => {
    const app = read('App.jsx')
    assert.match(app, /tiene_planilla_topografia === true/)
    assert.match(app, /Solo consultar planilla si la grilla/)
  })

  it('syncPizarra reintenta ante 503', () => {
    const src = read('modules/bloc-notas/blocNotasPizarra.js')
    assert.match(src, /fetchPizarraConReintento/)
    assert.match(src, /status === 503/)
  })
})
