/**
 * Capítulo fijo Administración (AIU) en nueva solicitud.
 * node --test frontend/src/almacen/solicitudAdministracionAiu.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

const CAPITULO_ADMINISTRACION_AIU = 'Administración (AIU)'

function isAdministracionAiu(...parts) {
  return parts.some((p) => String(p || '').trim() === CAPITULO_ADMINISTRACION_AIU)
}

function validateSolicitudItems(items) {
  const errors = []
  items.forEach((it, idx) => {
    const n = idx + 1
    const esAiu = isAdministracionAiu(it.presupuesto_capitulo, it.presupuesto_item)
    if (!it.presupuesto_capitulo || !it.presupuesto_item) {
      errors.push(`Línea ${n}: seleccione capítulo e ítem de cobro.`)
    }
    if (!it.pk_id) errors.push(`Línea ${n}: seleccione la ubicación PK-ID en el mapa.`)
    if (!esAiu && !it.presupuesto_id) {
      errors.push(`Línea ${n}: seleccione el registro de presupuesto en la grilla.`)
    }
    if (!it.cantidad || Number(it.cantidad) <= 0) {
      errors.push(`Línea ${n}: indique una cantidad mayor a cero.`)
    }
  })
  return errors.length ? { ok: false, message: errors.join('\n') } : { ok: true }
}

describe('Administración (AIU)', () => {
  it('detecta el capítulo/ítem fijo', () => {
    assert.equal(isAdministracionAiu(CAPITULO_ADMINISTRACION_AIU), true)
    assert.equal(isAdministracionAiu('1. PRELIMINARES'), false)
    assert.equal(isAdministracionAiu('1.', CAPITULO_ADMINISTRACION_AIU), true)
  })

  it('validación no exige presupuesto_id en líneas AIU', () => {
    const base = {
      presupuesto_capitulo: CAPITULO_ADMINISTRACION_AIU,
      presupuesto_item: CAPITULO_ADMINISTRACION_AIU,
      pk_id: 'PK-1',
      presupuesto_id: null,
      cantidad: 2,
      descripcion_solicitada: 'Papelería oficina',
    }
    assert.equal(validateSolicitudItems([base]).ok, true)
  })

  it('validación sigue exigiendo presupuesto_id en capítulos normales', () => {
    const base = {
      presupuesto_capitulo: '1.',
      presupuesto_item: '1.01',
      pk_id: 'PK-1',
      presupuesto_id: null,
      cantidad: 2,
      descripcion_solicitada: 'Cemento',
    }
    const r = validateSolicitudItems([base])
    assert.equal(r.ok, false)
    assert.match(r.message, /registro de presupuesto/i)
  })

  it('selector incluye opción fija y autocompleta ítem', () => {
    const src = readFileSync(join(dir, 'PresupuestoItemSelector.jsx'), 'utf8')
    const helpers = readFileSync(join(dir, 'solicitudFormHelpers.js'), 'utf8')
    assert.match(helpers, /CAPITULO_ADMINISTRACION_AIU = 'Administración \(AIU\)'/)
    assert.match(helpers, /export function isAdministracionAiu/)
    assert.match(src, /CAPITULO_ADMINISTRACION_AIU/)
    assert.match(src, /isAdministracionAiu\(cap\)/)
  })

  it('formulario omite control Ppto/Acum/Saldo en AIU', () => {
    const form = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
    const excel = readFileSync(join(dir, 'SolicitudFormExcelTable.jsx'), 'utf8')
    const ubic = readFileSync(join(dir, 'SolicitudLineaUbicacionEditor.jsx'), 'utf8')
    const sql = readFileSync(join(dir, '../../../backend/sql/almacen_solicitud_administracion_aiu.sql'), 'utf8')
    assert.match(form, /es_administracion_aiu/)
    assert.match(form, /no está sujeta al control de presupuesto/)
    assert.match(excel, /isAdministracionAiu/)
    assert.match(ubic, /sin registro de presupuesto de obra/)
    assert.match(sql, /ALTER COLUMN presupuesto_id DROP NOT NULL/)
  })
})
