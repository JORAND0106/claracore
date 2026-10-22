/**
 * Caso 34 · Paridad total de la herramienta en todos los puntos de invocación.
 * Inventario + markers del modal + planilla topografía (sync coords).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ESQUEMA_EDITOR_CANONICAL,
  ESQUEMA_INVOCATION_POINTS,
  ESQUEMA_PARITY_FEATURE_GROUPS,
  ESQUEMA_PARITY_MARKERS,
} from './esquemaInvocationPoints.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(__dirname, '../..')

function readSrc(rel) {
  const p = join(srcRoot, rel)
  assert.ok(existsSync(p), `falta archivo de invocación: ${rel}`)
  return readFileSync(p, 'utf8')
}

describe('caso 34 · paridad de invocación del esquema', () => {
  it('inventario cubre ≥12 puntos y todos los grupos de paridad', () => {
    assert.ok(ESQUEMA_INVOCATION_POINTS.length >= 12)
    for (const pt of ESQUEMA_INVOCATION_POINTS) {
      assert.ok(pt.id && pt.module && pt.file, JSON.stringify(pt))
      for (const g of ESQUEMA_PARITY_FEATURE_GROUPS) {
        assert.ok(
          pt.featureGroups.includes(g),
          `${pt.id} sin grupo ${g}`,
        )
      }
    }
    const topo = ESQUEMA_INVOCATION_POINTS.filter((p) => p.topoTramoCoords)
    assert.ok(topo.length >= 2, 'planilla tubería crear+asociar')
    const sicoeOnly = ESQUEMA_INVOCATION_POINTS.filter((p) => p.sicoeOnly)
    assert.equal(sicoeOnly.length, 1)
    assert.equal(sicoeOnly[0].id, 'sicoe-dibujo-reporte')
  })

  it('cada punto importa el modal canónico (sin fork)', () => {
    const modalSrc = readSrc(ESQUEMA_EDITOR_CANONICAL)
    assert.match(modalSrc, /export default function EsquemaEditorModal/)

    for (const pt of ESQUEMA_INVOCATION_POINTS) {
      const src = readSrc(pt.file)
      assert.match(
        src,
        /EsquemaEditorModal/,
        `${pt.id} (${pt.file}) no referencia EsquemaEditorModal`,
      )
      // No debe reimplementar el editor inline.
      assert.doesNotMatch(
        src,
        /function EsquemaEditorModal\s*\(/,
        `${pt.id} redefine el modal`,
      )
      if (pt.sicoeOnly) {
        assert.match(src, /huellaMode/)
      } else {
        // Fuera de SicoeObra huella: no forzar huellaMode={true}
        assert.doesNotMatch(
          src,
          /huellaMode(?:\s*=\s*\{?\s*true|\s+)/,
          `${pt.id} no debe activar huellaMode`,
        )
      }
    }
  })

  it('el modal canónico expone todos los grupos de funciones del Concepto 2', () => {
    const modal = readSrc(ESQUEMA_EDITOR_CANONICAL)
    for (const group of ESQUEMA_PARITY_FEATURE_GROUPS) {
      const markers = ESQUEMA_PARITY_MARKERS[group]
      assert.ok(markers?.length, `markers ${group}`)
      for (const re of markers) {
        assert.match(
          modal,
          re,
          `grupo ${group}: falta marker ${re}`,
        )
      }
    }
    // Paridad coords: dibujo por tipo no exige huellaMode
    assert.match(modal, /effectiveDibujoTipo|dibujoTipoRef/)
    assert.match(modal, /esquema-coords-tool-block/)
    // Parrilla solo desarrollador (en todos los puntos vía el modal)
    assert.match(modal, /allowDibujarParrilla/)
  })

  it('planilla topografía: precarga coords + sync al guardar', () => {
    for (const pt of ESQUEMA_INVOCATION_POINTS.filter((p) => p.topoTramoCoords)) {
      const src = readSrc(pt.file)
      assert.match(src, /seedTramo/)
      assert.match(src, /initialCoordRows/)
      assert.match(src, /coordRowsFromSeedTramo|seedTramoFromCoordRows/)
      assert.match(src, /onTramoCoordsChange/)
      assert.match(src, /extras\?\.coordRows|seedTramoFromCoordRows\(extras/)
    }
    const form = readSrc('components/topografia/planillaTuberia/PlanillaTuberiaForm.jsx')
    assert.match(form, /onTramoCoordsChange/)
    assert.match(form, /planillaParamsPatchFromSeed/)
    assert.match(form, /norte_abs_inicial/)
    // onSave del modal incluye coordRows
    const modal = readSrc(ESQUEMA_EDITOR_CANONICAL)
    assert.match(modal, /coordRows:\s*Array\.isArray\(coordRowsRef\.current\)/)
  })

  it('contrato C-TX-08 + caso 34 cableados', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /C-TX-08/)
    assert.match(md, /paridad/i)
    assert.match(md, /34\.\s*\*\*Paridad/)
    assert.match(md, /esquemaParidadInvocacion/)
    assert.match(md, /esquemaInvocationPoints/)
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaParidadInvocacion\.scenario\.test\.js/)
    assert.match(pkg.scripts['test:esquema'], /esquemaTopoCoordsSync\.test\.js/)
  })
})
