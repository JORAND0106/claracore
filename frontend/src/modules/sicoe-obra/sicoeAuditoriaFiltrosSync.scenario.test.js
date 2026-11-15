/**
 * Auditoría debe respetar el mismo estado de filtros del módulo.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { esTraslapoMismoReporte } from './sicoeAuditoriaTraslapos.js'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../../App.jsx'), 'utf8')
const filtroVista = readFileSync(join(here, 'SicoeFiltroObraVista.jsx'), 'utf8')
const auditoria = readFileSync(join(here, 'SicoeAmbienteAuditoria.jsx'), 'utf8')
const huellas = readFileSync(join(here, '../../../../backend/sicoe_huellas_espacial.py'), 'utf8')

describe('Auditoría — sync filtros del módulo', () => {
  it('al buscar en CPI/Auditoría marca busquedaRealizada=true', () => {
    const idx = app.indexOf("vista === 'cantidades_item' || vista === 'ejecucion_consolidada'")
    assert.ok(idx > 0)
    const branch = app.slice(idx, idx + 900)
    assert.match(branch, /setBusquedaRealizada\(true\)/)
  })

  it('Criterios no dice Ninguno cuando hay chips activos', () => {
    assert.match(filtroVista, /tieneCriterios \? resumen : 'Ninguno'/)
    assert.equal(/busquedaRealizada && tieneCriterios \? resumen : 'Ninguno'/.test(filtroVista), false)
  })

  it('sin búsqueda activa Auditoría no muestra hallazgos del contrato', () => {
    assert.match(auditoria, /if \(!busquedaActiva\)/)
    assert.match(auditoria, /Defina criterios en/)
    assert.match(auditoria, /setAmbitoListo\(false\)/)
    assert.match(auditoria, /Aplicando filtros del módulo/)
  })

  it('fallo de ámbito no degrada a todo el contrato', () => {
    assert.match(auditoria, /setAmbitoRegIds\(new Set\(\)\)/)
    assert.equal(/catch \{\s*\/\/ Si falla el ámbito[\s\S]*setAmbitoRegIds\(null\)/.test(auditoria), false)
  })

  it('traslapo mismo reporte se detecta con reporte_id', () => {
    assert.equal(
      esTraslapoMismoReporte({
        tipo: 'traslapo',
        registros_involucrados: [
          { id: 306, reporte_id: 12, numero_registro: 306 },
          { id: 307, reporte_id: 12, numero_registro: 307 },
          { id: 308, reporte_id: 12, numero_registro: 308 },
        ],
      }),
      true,
    )
  })

  it('huellas nodo solo marcan traslapo entre reportes distintos con ids presentes', () => {
    assert.match(huellas, /reg\.get\("reporte_id"\) is not None/)
    assert.match(huellas, /p\.get\("reporte_id"\) is not None/)
    assert.equal(
      /reg\.get\("reporte_id"\) is None\s+or p\.get\("reporte_id"\) is None/.test(huellas),
      false,
    )
  })
})
