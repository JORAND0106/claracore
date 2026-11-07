import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRECACHE_MSG } from './shellCache.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '../../public')
const root = join(__dirname, '../..')

describe('PWA shell offline', () => {
  it('service worker precachea shell en install (v10 + cache-first)', () => {
    const sw = readFileSync(join(publicDir, 'sw.js'), 'utf8')
    assert.match(sw, /claracore-shell-v10/)
    assert.match(sw, /SHELL_PRECACHE|__CLARACORE_PRECACHE__/)
    assert.match(sw, /\/index\.html/)
    assert.match(sw, /\/manifest\.webmanifest/)
    assert.match(sw, /CLARACORE_PRECACHE_URLS/)
    assert.match(sw, new RegExp(PRECACHE_MSG))
    assert.match(sw, /cacheFirst/)
    assert.match(sw, /\/assets\//)
  })

  it('vite inyecta precache de assets en build', () => {
    const plugin = join(root, 'vite-plugin-sw-precache.js')
    assert.ok(existsSync(plugin))
    const src = readFileSync(plugin, 'utf8')
    assert.match(src, /__CLARACORE_PRECACHE__/)
    const vite = readFileSync(join(root, 'vite.config.js'), 'utf8')
    assert.match(vite, /claracoreSwPrecache/)
  })

  it('manifest instalable existe', () => {
    const path = join(publicDir, 'manifest.webmanifest')
    assert.ok(existsSync(path))
    const m = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(m.display, 'standalone')
    assert.equal(m.start_url, '/')
    assert.ok(Array.isArray(m.icons) && m.icons.length >= 1)
  })

  it('index.html enlaza manifest y apple web app', () => {
    const html = readFileSync(join(__dirname, '../../index.html'), 'utf8')
    assert.match(html, /manifest\.webmanifest/)
    assert.match(html, /apple-mobile-web-app-capable/)
  })
})
