/**
 * Regresión: Estructura de Vía solo usa tramos con rasante+capas; el aviso lista incompletos.
 * node --test src/components/topografia/entregaEjeListo.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('Estructura de Vía — tramos listos vs incompletos', () => {
  it('clasifica ejes/tramos sin ocultar los incompletos en el aviso', () => {
    const src = readFileSync(join(dir, 'EntregaDgObraForm.jsx'), 'utf8')
    assert.match(src, /ejesIncompletos/)
    assert.match(src, /filas_rasante/)
    assert.match(src, /num_capas/)
    assert.match(src, /rasante CSV \(estaciones\)/)
    assert.match(src, /estructura de capas/)
    assert.match(src, /cargue el diseño geométrico/)
  })

  it('Configuración DG usa grilla de tramos y estructuras del contrato', () => {
    const src = readFileSync(join(dir, 'DisenoGeometricoForm.jsx'), 'utf8')
    assert.match(src, /Estructuras del contrato/)
    assert.match(src, /Crear tramo/)
    assert.match(src, /Diseño geométrico/)
    assert.match(src, /DisenoTramoMapaPkModal/)
    assert.match(src, /TopoExcelSheet/)
  })
})
