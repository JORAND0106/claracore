/**
 * C-OUT-14 — ciclo de vida: keep-alive y reapertura tras kill de página.
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  consumeEsquemaEditorPendingReopen,
  getEsquemaEditorOpenCount,
  isEsquemaEditorOpen,
  markEsquemaEditorClosed,
  markEsquemaEditorOpened,
  peekEsquemaEditorPendingReopen,
  shouldKeepSessionAliveForEsquema,
} from './esquemaEditorLifecycle.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** sessionStorage mínimo en node. */
function installSessionStorage() {
  const map = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(String(k), String(v)) },
    removeItem: (k) => { map.delete(String(k)) },
    clear: () => map.clear(),
  }
}

beforeEach(() => {
  installSessionStorage()
  while (getEsquemaEditorOpenCount() > 0) markEsquemaEditorClosed()
})

describe('esquemaEditorLifecycle', () => {
  it('marca abierto / cerrado y keep-alive', () => {
    assert.equal(isEsquemaEditorOpen(), false)
    markEsquemaEditorOpened({ module: 'sicoe-obra', entityId: 440, contratoId: 1 })
    assert.equal(isEsquemaEditorOpen(), true)
    assert.equal(shouldKeepSessionAliveForEsquema(), true)
    const pending = peekEsquemaEditorPendingReopen()
    assert.equal(pending.module, 'sicoe-obra')
    assert.equal(pending.entityId, '440')
    markEsquemaEditorClosed()
    assert.equal(isEsquemaEditorOpen(), false)
    assert.equal(peekEsquemaEditorPendingReopen(), null)
  })

  it('consume pendiente solo si coincide el lugar', () => {
    markEsquemaEditorOpened({ module: 'bitacora', entityId: 'draft', contratoId: 7 })
    // Simula kill de página: no se llama closed → queda pendiente.
    // Forzamos openCount a 0 sin borrar storage.
    markEsquemaEditorClosed()
    // Tras closed real no hay pendiente; re-marcar y "fake kill":
    markEsquemaEditorOpened({ module: 'bitacora', entityId: '99', contratoId: 7 })
    const raw = sessionStorage.getItem('cc_esquema_editor_open_v1')
    markEsquemaEditorClosed()
    sessionStorage.setItem('cc_esquema_editor_open_v1', raw) // kill: cleanup no corrió
    assert.equal(consumeEsquemaEditorPendingReopen({ module: 'sicoe-obra', entityId: '99' }), null)
    const hit = consumeEsquemaEditorPendingReopen({
      module: 'bitacora', entityId: '99', contratoId: 7,
    })
    assert.ok(hit)
    assert.equal(hit.entityId, '99')
    assert.equal(peekEsquemaEditorPendingReopen(), null)
  })
})

describe('C-OUT-14 · evidencia en código', () => {
  it('HojaRegistro usa key estable (no remonta por grafico_url)', () => {
    const app = readFileSync(join(__dirname, '../../App.jsx'), 'utf8')
    assert.match(app, /sicoeHojaRegistroStableKey/)
    assert.doesNotMatch(app, /sicoeHojaRegistroSyncKey/)
    assert.match(app, /key=\{sicoeHojaRegistroStableKey\(reg\)\}/)
    // La key estable no incluye grafico_url
    const fn = app.slice(
      app.indexOf('function sicoeHojaRegistroStableKey'),
      app.indexOf('// ─── HOJA REGISTRO'),
    )
    assert.doesNotMatch(fn, /grafico_url/)
    assert.doesNotMatch(fn, /cantidad_total/)
  })

  it('sesión keep-alive + touch/pointer; indicador Guardado/Guardando', () => {
    const app = readFileSync(join(__dirname, '../../App.jsx'), 'utf8')
    assert.match(app, /shouldKeepSessionAliveForEsquema/)
    assert.match(app, /touchstart/)
    assert.match(app, /pointerdown/)
    assert.match(app, /isEsquemaEditorOpen/)
    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /esquema-draft-status/)
    assert.match(modal, /Guardando…/)
    assert.match(modal, /markEsquemaEditorOpened/)
    assert.match(modal, /visibilitychange/)
    assert.match(modal, /pagehide/)
    assert.match(modal, /addEventListener\('freeze'/)
    assert.match(modal, /addEventListener\('online'/)
  })

  it('contrato declara nunca pierde el trabajo', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /nunca pierde el trabajo/i)
    assert.match(md, /sicoeHojaRegistroStableKey|key.*estable|no se remonta/i)
    assert.match(md, /esquemaEditorLifecycle/)
  })
})
