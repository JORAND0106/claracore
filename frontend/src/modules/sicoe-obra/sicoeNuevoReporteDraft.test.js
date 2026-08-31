import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeNuevoReporteDraftClear,
  sicoeNuevoReporteDraftIsDirty,
  sicoeNuevoReporteDraftKey,
  sicoeNuevoReporteDraftLoad,
  sicoeNuevoReporteDraftSave,
  sicoeNuevoReporteRequestFlush,
  SICOE_NUEVO_REPORTE_FLUSH_EVENT,
} from './sicoeNuevoReporteDraft.js'

function mockLocalStorage() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
  }
  return store
}

describe('sicoeNuevoReporteDraft', () => {
  beforeEach(() => {
    mockLocalStorage()
  })

  it('key estable por contrato/usuario/reporte', () => {
    assert.equal(
      sicoeNuevoReporteDraftKey(2, 9, null),
      'cc_sicoe_nuevo_reporte_draft_v1:2:9:nuevo',
    )
    assert.equal(
      sicoeNuevoReporteDraftKey(2, 9, 55),
      'cc_sicoe_nuevo_reporte_draft_v1:2:9:55',
    )
  })

  it('detecta dirty solo con datos reales', () => {
    assert.equal(sicoeNuevoReporteDraftIsDirty({}), false)
    assert.equal(sicoeNuevoReporteDraftIsDirty({ descripcion: '  ' }), false)
    assert.equal(sicoeNuevoReporteDraftIsDirty({ descripcion: 'Obra' }), true)
    assert.equal(sicoeNuevoReporteDraftIsDirty({ registros: [{ nombre: 'a' }] }), true)
  })

  it('guarda y recupera borrador en localStorage', () => {
    const snap = { descripcion: 'Prueba campo', registros: [{ nombre: 'R1' }] }
    assert.equal(sicoeNuevoReporteDraftSave(1, 7, snap), true)
    const loaded = sicoeNuevoReporteDraftLoad(1, 7)
    assert.equal(loaded.descripcion, 'Prueba campo')
    assert.equal(loaded.registros.length, 1)
    sicoeNuevoReporteDraftClear(1, 7)
    assert.equal(sicoeNuevoReporteDraftLoad(1, 7), null)
  })

  /**
   * Reproducción causa raíz (pre-fix): datos solo en memoria + cierre sin persistir
   * ⇒ en Supabase el reporte no existe. Mitigación: autosave local sobrevive al «cierre».
   */
  it('REPRO: cierre sin guardar no deja rastro en DB; borrador local sí sobrevive', () => {
    // Simula captura en campo (estado React) que NUNCA llegó a POST /reportes
    const formEnMemoria = {
      descripcion: 'Excavación PK 12+500',
      subSeleccionado: { id: 3, nombre: 'Sub X' },
      registros: [
        { nombre: 'Excavación', cantidad: '12.5', observacion: 'Lado derecho' },
        { nombre: 'Relleno', cantidad: '4', observacion: 'Capa 1' },
      ],
    }
    // Sin autosave: al cerrar modal, memoria se pierde → nada en DB (síntoma producción)
    assert.equal(sicoeNuevoReporteDraftLoad(10, 99), null)

    // Con autosave (mitigación): flush antes de desmontar
    assert.equal(sicoeNuevoReporteDraftSave(10, 99, formEnMemoria), true)
    // «Sesión cerrada» / ✕ desmonta React; al reabrir se recupera
    const recuperado = sicoeNuevoReporteDraftLoad(10, 99)
    assert.ok(recuperado)
    assert.equal(recuperado.descripcion, 'Excavación PK 12+500')
    assert.equal(recuperado.registros.length, 2)
    assert.equal(recuperado.subSeleccionado.id, 3)
  })

  it('REPRO: flush por evento de inactividad preserva captura', () => {
    const listeners = new Map()
    class FakeCustomEvent {
      constructor(type) { this.type = type }
    }
    globalThis.CustomEvent = FakeCustomEvent
    globalThis.window = {
      dispatchEvent(ev) {
        const hs = listeners.get(ev.type) || []
        hs.forEach((h) => h(ev))
        return true
      },
      addEventListener(type, h) {
        if (!listeners.has(type)) listeners.set(type, [])
        listeners.get(type).push(h)
      },
      removeEventListener(type, h) {
        const hs = listeners.get(type) || []
        listeners.set(type, hs.filter((x) => x !== h))
      },
    }
    let flushed = false
    const handler = () => {
      sicoeNuevoReporteDraftSave(4, 1, {
        descripcion: 'Captura interrumpida por inactividad',
        registros: [{ nombre: 'Línea 1' }],
      })
      flushed = true
    }
    // El modal registra el listener en window (igual que App.jsx)
    globalThis.window.addEventListener(SICOE_NUEVO_REPORTE_FLUSH_EVENT, handler)
    try {
      sicoeNuevoReporteRequestFlush()
      assert.equal(flushed, true)
      const snap = sicoeNuevoReporteDraftLoad(4, 1)
      assert.equal(snap.descripcion, 'Captura interrumpida por inactividad')
    } finally {
      globalThis.window.removeEventListener(SICOE_NUEVO_REPORTE_FLUSH_EVENT, handler)
    }
  })

  it('tras envío exitoso, clear elimina clave nuevo y por id', () => {
    sicoeNuevoReporteDraftSave(1, 2, { descripcion: 'tmp', borradorId: 88 }, null)
    sicoeNuevoReporteDraftSave(1, 2, { descripcion: 'tmp', borradorId: 88 }, 88)
    assert.ok(sicoeNuevoReporteDraftLoad(1, 2, null) || sicoeNuevoReporteDraftLoad(1, 2, 88))
    sicoeNuevoReporteDraftClear(1, 2, 88)
    assert.equal(sicoeNuevoReporteDraftLoad(1, 2, null), null)
    assert.equal(sicoeNuevoReporteDraftLoad(1, 2, 88), null)
  })

  it('dirty con solo borradorId (cabecera servidor sin líneas aún)', () => {
    assert.equal(sicoeNuevoReporteDraftIsDirty({ borradorId: 123 }), true)
  })
})

/**
 * Invariante del backend insert-then-delete (documentado aquí como contrato de seguridad).
 * Si insert falla, old_ids NO deben borrarse → el reporte no queda vacío.
 */
describe('reemplazar-registros invariante (insert-then-delete)', () => {
  it('simula: insert falla ⇒ previos intactos; insert OK ⇒ previos se eliminan', () => {
    const db = { rows: [{ id: 1 }, { id: 2 }] }
    const replaceSafe = (newRows, insertOk) => {
      const oldIds = db.rows.map((r) => r.id)
      if (!insertOk) {
        // falla insert: no tocar old
        return { ok: false, rows: [...db.rows] }
      }
      const inserted = newRows.map((r, i) => ({ id: 100 + i, ...r }))
      db.rows = [...db.rows, ...inserted]
      db.rows = db.rows.filter((r) => !oldIds.includes(r.id))
      return { ok: true, rows: db.rows }
    }
    const fail = replaceSafe([{ nombre: 'N' }], false)
    assert.equal(fail.ok, false)
    assert.deepEqual(fail.rows.map((r) => r.id), [1, 2])

    const ok = replaceSafe([{ nombre: 'N1' }, { nombre: 'N2' }], true)
    assert.equal(ok.ok, true)
    assert.deepEqual(ok.rows.map((r) => r.id), [100, 101])
  })

  it('ANTI-patrón delete-first: insert falla ⇒ pérdida total (causa 2º síntoma)', () => {
    const db = { rows: [{ id: 1, nombre: 'A' }] }
    const replaceUnsafe = (newRows, insertOk) => {
      db.rows = [] // delete first
      if (!insertOk) return { ok: false, rows: [...db.rows] }
      db.rows = newRows.map((r, i) => ({ id: 100 + i, ...r }))
      return { ok: true, rows: db.rows }
    }
    const fail = replaceUnsafe([{ nombre: 'N' }], false)
    assert.equal(fail.ok, false)
    assert.equal(fail.rows.length, 0) // ← reporte vacío / datos perdidos
  })
})
