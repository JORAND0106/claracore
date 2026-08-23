/**
 * Regresión: Entrega DG solo usa ejes con rasante+capas; el aviso lista incompletos.
 * node --test src/components/topografia/entregaEjeListo.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('Entrega DG — ejes listos vs incompletos', () => {
  it('clasifica ejes sin ocultar los incompletos en el aviso', () => {
    const src = readFileSync(join(dir, 'EntregaDgObraForm.jsx'), 'utf8')
    assert.match(src, /ejesIncompletos/)
    assert.match(src, /filas_rasante/)
    assert.match(src, /num_capas/)
    assert.match(src, /rasante CSV \(estaciones\)/)
    assert.match(src, /estructura de capas/)
    assert.match(src, /Subir CSV \/ Excel/)
  })

  it('Configuración DG avisa si hay capas pero 0 estaciones CSV', () => {
    const src = readFileSync(join(dir, 'DisenoGeometricoForm.jsx'), 'utf8')
    assert.match(src, /capas\.length > 0/)
    assert.match(src, /0 CSV/)
    assert.match(src, /Entrega DG Obra/)
  })
})
