import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRECACHE_MSG } from './shellCache.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '../../public')

describe('PWA shell offline', () => {
  it('service worker precachea shell en install', () => {
    const sw = readFileSync(join(publicDir, 'sw.js'), 'utf8')
    assert.match(sw, /claracore-shell-v9/)
    assert.match(sw, /SHELL_PRECACHE/)
    assert.match(sw, /\/index\.html/)
    assert.match(sw, /\/manifest\.webmanifest/)
    assert.match(sw, /CLARACORE_PRECACHE_URLS/)
    assert.match(sw, new RegExp(PRECACHE_MSG))
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
