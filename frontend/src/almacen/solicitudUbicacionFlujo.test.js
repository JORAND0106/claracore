/**
 * Correcciones nueva solicitud: ítems, mapa directo, tramo.
 * node --test frontend/src/almacen/solicitudUbicacionFlujo.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('flujo ubicación solicitud Excel', () => {
  it('abre mapa satelital directo (sin popup intermedio con botón PK mapa)', () => {
    const excel = readFileSync(join(dir, 'SolicitudFormExcelTable.jsx'), 'utf8')
    const editor = readFileSync(join(dir, 'SolicitudLineaUbicacionEditor.jsx'), 'utf8')
    const mapa = readFileSync(join(dir, 'AlmacenPkMapaSelector.jsx'), 'utf8')
    assert.match(excel, /phase: 'mapa'/)
    assert.match(excel, /initialBasemap="satelite"/)
    assert.match(excel, /autoOpen/)
    assert.match(excel, /hideTrigger/)
    assert.doesNotMatch(editor, /AlmacenPkMapaSelector/)
    assert.match(editor, /Completar ubicación/)
    assert.match(mapa, /zIndex:\s*100060/)
    assert.match(mapa, /initialBasemap/)
  })

  it('conserva tramo al seleccionar PK en SolicitudForm', () => {
    const src = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
    const resolver = readFileSync(join(dir, 'almacenPkResolver.js'), 'utf8')
    assert.match(src, /tramo: String\(sel\.tramo \|\| ''\)\.trim\(\)/)
    assert.match(resolver, /row\.tramo \|\| tramoProps/)
  })

  it('ítems Excel usan portal para no quedar recortados por overflow', () => {
    const src = readFileSync(join(dir, 'PresupuestoItemSelector.jsx'), 'utf8')
    assert.match(src, /createPortal/)
    assert.match(src, /setOpen\(true\)/)
    assert.match(src, /getListadoItems\(capitulo\)/)
  })

  it('PptoFiltroMapaPk acepta initialBasemap satélite', () => {
    const src = readFileSync(join(dir, '../modules/presupuesto/PptoFiltroMapaPk.jsx'), 'utf8')
    assert.match(src, /initialBasemap\s*=\s*null/)
    assert.match(src, /sicoeBasemapStyleUrl\(basemapMode\)/)
  })
})
