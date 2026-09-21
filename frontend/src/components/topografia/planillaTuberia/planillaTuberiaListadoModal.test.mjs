/**
 * Planillas de Tubería: listado Excel en el módulo + popup de edición no descartable.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaListadoModal.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const mainSrc = readFileSync(join(dir, '../TopografiaMain.jsx'), 'utf8')
const routesSrc = readFileSync(join(dir, '../../../../../backend/topografia_planilla_tuberia_routes.py'), 'utf8')

describe('Planillas de Tubería — listado + modal', () => {
  it('elimina la sección de menú Biblioteca de tramos', () => {
    assert.doesNotMatch(mainSrc, /topo_biblioteca_tramos/)
    assert.doesNotMatch(mainSrc, /Biblioteca de tramos/)
    assert.doesNotMatch(mainSrc, /BibliotecaTramos/)
    assert.doesNotMatch(mainSrc, /planillaTuberiaFocusId/)
    assert.ok(!existsSync(join(dir, 'BibliotecaTramos.jsx')))
  })

  it('muestra listado tipo Excel como vista principal', () => {
    assert.match(formSrc, /Planillas del contrato/)
    assert.match(formSrc, /Nombre Planilla/)
    assert.match(formSrc, /Fecha de generada/)
    assert.match(formSrc, /Quien Validó por última vez/)
    assert.match(formSrc, /validado_por_nombre/)
    assert.match(formSrc, /fmtFechaLista/)
    assert.match(formSrc, /Nueva planilla/)
    assert.match(formSrc, /api\('\/planillas-tuberia'\)/)
  })

  it('abre edición en popup no descartable por clic fuera', () => {
    assert.match(formSrc, /editorOpen/)
    assert.match(formSrc, /setEditorOpen\(true\)/)
    assert.match(formSrc, /volverAlListado/)
    assert.match(formSrc, /Volver al listado/)
    assert.match(formSrc, /aria-modal="true"/)
    assert.match(formSrc, /role="dialog"/)

    const start = formSrc.indexOf('{editorOpen && (')
    const end = formSrc.indexOf('{confirmEliminar && (', start)
    assert.ok(start >= 0 && end > start, 'bloque overlay no encontrado')
    const overlayBlock = formSrc.slice(start, end)

    assert.match(overlayBlock, /position:\s*'fixed'/)
    // El backdrop (contenedor fixed) no debe cerrar al hacer clic
    assert.doesNotMatch(overlayBlock, /role="presentation"[\s\S]{0,400}onClick=\{[^}]*volverAlListado/)
    assert.doesNotMatch(overlayBlock, /role="presentation"[\s\S]{0,400}onClick=\{[^}]*setEditorOpen\(false\)/)
    assert.match(overlayBlock, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/)
  })

  it('conserva el contenido de edición dentro del popup', () => {
    assert.match(formSrc, /Cabecera \/ tramo/)
    assert.match(formSrc, /Cartera de campo/)
    assert.match(formSrc, /Resumen de Cantidades/)
    assert.match(formSrc, /Descuentos Específicos/)
    assert.match(formSrc, /setPkMapOpen\(true\)/)
    assert.match(formSrc, /title="Eliminar planilla"/)
    assert.doesNotMatch(formSrc, /Biblioteca de tramos/)
    assert.doesNotMatch(formSrc, /planillaIdFocus/)
  })

  it('enriquece el listado API con quien validó', () => {
    assert.match(routesSrc, /validado_por_nombre/)
    assert.match(routesSrc, /validado_por/)
    assert.match(routesSrc, /cerrado_por/)
  })
})
