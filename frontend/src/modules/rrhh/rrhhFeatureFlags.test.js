/**
 * Run: node --test src/modules/rrhh/rrhhFeatureFlags.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RRHH_AUDITORIA_DOCUMENTAL_ACTIVA,
  auditoriaDocumentalActiva,
} from './rrhhFeatureFlags.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('rrhhFeatureFlags', () => {
  it('auditoría documental OFF por defecto', () => {
    assert.equal(RRHH_AUDITORIA_DOCUMENTAL_ACTIVA, false)
    assert.equal(auditoriaDocumentalActiva(), false)
  })

  it('DocumentacionTab y grilla respetan el flag', () => {
    const tab = readFileSync(join(dir, 'DocumentacionTab.jsx'), 'utf8')
    assert.match(tab, /auditoriaDocumentalActiva/)
    assert.match(tab, /auditoriaActiva && \(/)
    const mod = readFileSync(join(dir, 'ModuloRrhh.jsx'), 'utf8')
    assert.match(mod, /mostrarTonoAuditoria:\s*auditoriaActiva/)
    assert.match(mod, /setValidacionDocumentacionMasiva/)
    assert.match(mod, /validacionMasiva/)
  })
})
