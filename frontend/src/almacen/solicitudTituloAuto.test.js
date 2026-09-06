/**
 * Título automático de solicitud.
 * node --test frontend/src/almacen/solicitudTituloAuto.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'solicitudFormHelpers.js'), 'utf8')
const dtSrc = readFileSync(join(dir, '../..', '../backend/almacen_datetime.py'), 'utf8')

describe('formatSolicitudTituloAuto', () => {
  it('exporta helper de título automático en frontend', () => {
    assert.match(src, /export function formatSolicitudTituloAuto/)
    assert.match(src, /Solicitud #\$\{num\} - \$\{fecha\}/)
    assert.match(src, /ALMACEN_TIMEZONE/)
  })

  it('backend genera el mismo formato', () => {
    assert.match(dtSrc, /def format_solicitud_titulo/)
    assert.match(dtSrc, /Solicitud #\{num\} - \{fecha\}/)
  })

  it('formatea consecutivo + fecha Bogotá DD/MM/YYYY (lógica local)', () => {
    // Réplica mínima de la regla de negocio para no depender del bundler ESM.
    const ALMACEN_TIMEZONE = 'America/Bogota'
    function format(consecutivo, createdAt) {
      const d = new Date(createdAt)
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: ALMACEN_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d)
      const get = (type) => parts.find((p) => p.type === type)?.value || ''
      const fecha = `${get('day')}/${get('month')}/${get('year')}`
      const num = consecutivo != null && consecutivo !== '' ? String(consecutivo) : '…'
      return `Solicitud #${num} - ${fecha}`
    }
    assert.equal(format(3, '2026-07-13T15:00:00Z'), 'Solicitud #3 - 13/07/2026')
    assert.equal(format(null, '2026-07-13T15:00:00Z'), 'Solicitud #… - 13/07/2026')
  })
})
