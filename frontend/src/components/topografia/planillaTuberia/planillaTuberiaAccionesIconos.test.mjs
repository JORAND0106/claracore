/**
 * Barra de acciones de planilla tubería: iconos + sin cinta amarilla.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaAccionesIconos.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('Planilla tubería — acciones como iconos', () => {
  it('elimina la cinta amarilla informativa de plantilla vacía', () => {
    assert.doesNotMatch(formSrc, /Sin datos diligenciados/)
    assert.doesNotMatch(formSrc, /verificar formato \(sin valores de ejemplo\)/)
  })

  it('usa panel de iconos con tooltip (title/aria-label)', () => {
    assert.match(formSrc, /function AccionIcono/)
    assert.match(formSrc, /role="toolbar"/)
    assert.match(formSrc, /title="Guardar parámetros"/)
    assert.match(formSrc, /title="Guardar cartera"/)
    assert.match(formSrc, /title="Cerrar planilla"/)
    assert.match(formSrc, /title="Eliminar planilla"/)
    assert.match(formSrc, /Exportar PDF/)
    assert.match(formSrc, /Exportar Excel/)
    assert.match(formSrc, /minWidth: 44/)
    assert.match(formSrc, /minHeight: 44/)
  })

  it('conserva handlers y restricciones (dev / permisos)', () => {
    assert.match(formSrc, /onClick=\{guardarParams\}/)
    assert.match(formSrc, /onClick=\{guardarCartera\}/)
    assert.match(formSrc, /onClick=\{cerrar\}/)
    assert.match(formSrc, /onClick=\{solicitarEliminar\}/)
    assert.match(formSrc, /onClick=\{exportarPdf\}/)
    assert.match(formSrc, /onClick=\{exportarExcel\}/)
    assert.match(formSrc, /disabled=\{!conDatos && !esDev\}/)
    assert.match(formSrc, /puedeEliminar/)
    assert.match(formSrc, /puedeExportar/)
  })
})
