/**
 * Caso 42 · Arranque sin conexión de la plataforma instalada (PWA).
 * Contrato: CONTRATO_ESQUEMA.md · C-TX-09 / caso 42.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRECACHE_MSG } from './shellCache.js'
import {
  OFFLINE_OK_MODULOS,
  OFFLINE_MODULE_MESSAGE,
  moduloRequiereConexion,
} from './offlineModules.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const publicDir = join(root, 'public')
const srcDir = join(root, 'src')

describe('caso 42 · arranque PWA sin conexión', () => {
  it('SW usa caché primero para shell y assets (abre sin red)', () => {
    const sw = readFileSync(join(publicDir, 'sw.js'), 'utf8')
    assert.match(sw, /claracore-shell-v10/)
    assert.match(sw, /__CLARACORE_PRECACHE__/)
    assert.match(sw, /function cacheFirst/)
    assert.match(sw, /mode === 'navigate'/)
    assert.match(sw, /\/assets\//)
    assert.match(sw, /CLARACORE_PRECACHE_URLS/)
    assert.match(sw, new RegExp(PRECACHE_MSG))
    // Poll de versión: red primero; no bloquea arranque offline
    assert.match(sw, /searchParams\.has\('_'\)/)
  })

  it('plugin de build inyecta assets hasheados en el SW', () => {
    const plugin = readFileSync(join(root, 'vite-plugin-sw-precache.js'), 'utf8')
    assert.match(plugin, /claracoreSwPrecache/)
    assert.match(plugin, /__CLARACORE_PRECACHE__/)
    assert.match(plugin, /\/assets\//)
    const vite = readFileSync(join(root, 'vite.config.js'), 'utf8')
    assert.match(vite, /claracoreSwPrecache/)
  })

  it('App registra SW, precachea shell y restaura sesión local', () => {
    const app = readFileSync(join(srcDir, 'App.jsx'), 'utf8')
    assert.match(app, /serviceWorker\.register\(['"]\/sw\.js['"]/)
    assert.match(app, /initOfflineShell/)
    assert.match(app, /restoreUsuarioFromStorage/)
    assert.match(app, /irAModulo/)
    assert.match(app, /OFFLINE_MODULE_MESSAGE/)
    assert.match(app, /SicoeMensajeModal/)
    // /usuarios/me no limpia sesión por fallo de red (solo 401)
    assert.match(app, /if \(!cancelled && res\.status === 401\)/)
    assert.match(app, /catch \{ \/\* silencioso \*\/ \}/)
  })

  it('manifest instalable standalone en iPad / Android / portátil', () => {
    const path = join(publicDir, 'manifest.webmanifest')
    assert.ok(existsSync(path))
    const m = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(m.display, 'standalone')
    assert.equal(m.start_url, '/')
    assert.ok(Array.isArray(m.icons) && m.icons.length >= 1)
    const html = readFileSync(join(root, 'index.html'), 'utf8')
    assert.match(html, /manifest\.webmanifest/)
    assert.match(html, /apple-mobile-web-app-capable/)
  })

  it('módulos offline OK vs aviso institucional', () => {
    assert.equal(OFFLINE_OK_MODULOS.has('bloc_notas'), true)
    assert.equal(moduloRequiereConexion('sicoe_obra'), true)
    assert.match(OFFLINE_MODULE_MESSAGE, /conexión/i)
    assert.doesNotMatch(OFFLINE_MODULE_MESSAGE, /API|HTTP|fetch/i)
  })

  it('contrato C-TX-09 y caso 42 + cableado en test:esquema', () => {
    const md = readFileSync(
      join(srcDir, 'components/esquema/CONTRATO_ESQUEMA.md'),
      'utf8',
    )
    assert.match(md, /C-TX-09/)
    assert.match(md, /arranque sin conexión|sin conexión/i)
    assert.match(md, /caso 42|42\./)
    assert.match(md, /pwaArranqueOffline/)
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /pwaArranqueOffline\.scenario\.test\.js/)
    assert.match(pkg.scripts['test:esquema'], /offlineModules\.test\.js/)
  })
})
