/**
 * Trazabilidad Topografía — entidades alineadas con backend/topografia_audit.py
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const dir = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(dir, '../..')
const btnSrc = readFileSync(join(dir, 'TopoTrazabilidadButton.jsx'), 'utf8')
const planillaSrc = readFileSync(join(dir, 'planillaTuberia/PlanillaTuberiaForm.jsx'), 'utf8')
const polSrc = readFileSync(join(dir, 'PoligonalForm.jsx'), 'utf8')
const nivSrc = readFileSync(join(dir, 'NivelacionForm.jsx'), 'utf8')
const adminSrc = readFileSync(join(srcRoot, 'AdminPanel.jsx'), 'utf8')

describe('TopoTrazabilidadButton', () => {
  it('reutiliza TrazabilidadRegistroModal y entidades canónicas', () => {
    assert.match(btnSrc, /TrazabilidadRegistroModal/)
    assert.match(btnSrc, /topo_planilla_tuberia/)
    assert.match(btnSrc, /topo_poligonal/)
    assert.match(btnSrc, /topo_nivelacion/)
  })

  it('está cableado en planilla, poligonal y nivelación', () => {
    assert.match(planillaSrc, /TopoTrazabilidadButton/)
    assert.match(planillaSrc, /ENTIDAD_PLANILLA_TUBERIA/)
    assert.match(polSrc, /TopoTrazabilidadButton/)
    assert.match(polSrc, /ENTIDAD_POLIGONAL/)
    assert.match(nivSrc, /TopoTrazabilidadButton/)
    assert.match(nivSrc, /ENTIDAD_NIVELACION/)
  })

  it('Logs del sistema incluye TOPOGRAFIA y módulos recientes', () => {
    for (const m of ['TOPOGRAFIA', 'ALMACEN', 'SEGUIMIENTO', 'BITACORA', 'RRHH']) {
      assert.match(adminSrc, new RegExp(`"${m}"`))
    }
  })
})
