/**
 * Persistencia de es_principal + resalte de fila Total.
 * node --test frontend/src/almacen/almacenEsPrincipalPersist.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const dir = dirname(fileURLToPath(import.meta.url))

function coerceEsPrincipal(v) {
  if (v == null) return true
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return !['false', '0', 'f', 'no', 'n', 'off', ''].includes(s)
  }
  if (typeof v === 'number') return v !== 0
  return Boolean(v)
}

describe('es_principal — persistencia', () => {
  it('backend no omite es_principal en silencio y coerce al guardar', () => {
    const svc = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    assert.match(svc, /_SOLICITUD_ITEM_CRITICAL_COLUMNS/)
    assert.match(svc, /"es_principal"/)
    assert.match(svc, /def _coerce_es_principal/)
    assert.match(svc, /row\["es_principal"\] = _coerce_es_principal/)
    assert.match(svc, /def _update_solicitud_item_row/)
    assert.match(svc, /almacen_solicitud_es_principal\.sql/)
    assert.match(svc, /Sin esa migración la clasificación no se puede guardar/)
  })

  it('payload de guardar envía coerceEsPrincipal (incluye false)', () => {
    const form = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
    assert.match(form, /es_principal: coerceEsPrincipal\(it\.es_principal\)/)
    const helpers = readFileSync(join(dir, 'solicitudFormHelpers.js'), 'utf8')
    assert.match(helpers, /export function coerceEsPrincipal/)
    assert.match(helpers, /es_principal: coerceEsPrincipal\(it\.es_principal\)/)
  })

  it('coerceEsPrincipal interpreta false / "false" / 0 como asociado', () => {
    assert.equal(coerceEsPrincipal(false), false)
    assert.equal(coerceEsPrincipal('false'), false)
    assert.equal(coerceEsPrincipal('0'), false)
    assert.equal(coerceEsPrincipal(0), false)
    assert.equal(coerceEsPrincipal(true), true)
    assert.equal(coerceEsPrincipal(undefined), true)
    assert.equal(coerceEsPrincipal(null), true)
  })
})

describe('fila Total — resalte visual', () => {
  it('tabla aplica estilo destacado a es_total', () => {
    const src = readFileSync(join(dir, 'TablaRentabilidadAcumulada.jsx'), 'utf8')
    assert.match(src, /cc-almacen-rentabilidad-total/)
    assert.match(src, /boxShadow: `inset 3px 0 0 \$\{ui\.accent\}`/)
    assert.match(src, /fila\.es_total \? 800/)
  })
})
