import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('edición masiva nodos sin sello + renombre UI', () => {
  it('cuerpoTieneCambioSustantivo ya no incluye no_inicio/no_final', () => {
    const src = readFileSync(join(__dirname, 'ModuloPresupuesto.jsx'), 'utf8')
    const m = src.match(/function cuerpoTieneCambioSustantivo[\s\S]*?return keys\.some/)
    assert.ok(m, 'cuerpoTieneCambioSustantivo presente')
    assert.ok(!m[0].includes("'no_inicio'"), 'no_inicio excluido de sustantivos')
    assert.ok(!m[0].includes("'no_final'"), 'no_final excluido de sustantivos')
  })

  it('usa endpoint bulk-nodos (no PUT item) para nodos masivos', () => {
    const src = readFileSync(join(__dirname, 'ModuloPresupuesto.jsx'), 'utf8')
    assert.ok(src.includes('aplicarNodosMasiva'), 'helper aplicarNodosMasiva')
    assert.ok(src.includes('bulkNodos'), 'endpoint bulkNodos')
    const ver = readFileSync(join(__dirname, 'pptoVersionActiva.js'), 'utf8')
    assert.ok(ver.includes('bulk-nodos'), 'ruta bulk-nodos en version activa')
  })

  it('pestaña Dimensiones expone Nodo Inicial/Final', () => {
    const src = readFileSync(join(__dirname, 'PptoEdicionMasivaModal.jsx'), 'utf8')
    assert.ok(src.includes("th('Nodo Inicial'"), 'columna Nodo Inicial')
    assert.ok(src.includes("th('Nodo Final'"), 'columna Nodo Final')
    assert.ok(src.includes('puedeEditarNodos'), 'gated por permiso nodos')
  })

  it('renombra Validación por depuración → Validación Contratista solo en UI', () => {
    const modal = readFileSync(join(__dirname, 'PptoEdicionMasivaModal.jsx'), 'utf8')
    assert.ok(modal.includes("label: 'Validación Contratista'"))
    assert.ok(!modal.includes('Validación por depuración'))
    // ids internos intactos
    assert.ok(modal.includes("id: 'depuracion'"))
    assert.ok(modal.includes('puedeTabDepuracion'))
    assert.ok(modal.includes('onApplyDepuracion'))
  })
})
