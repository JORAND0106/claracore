/**
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaReporteSicoe.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  abscisasExtremosPlanilla,
  lineasPlanillaParaReporteSicoe,
  linksSicoeDesdeMeta,
  puedeCrearReporteSicoe,
} from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const modalSrc = readFileSync(join(dir, 'PlanillaTuberiaCrearReporteModal.jsx'), 'utf8')
const routesSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_routes.py'),
  'utf8',
)

describe('Planilla tubería → reporte SICOE', () => {
  it('UI expone Crear reporte y modal de captura', () => {
    assert.match(formSrc, /Crear reporte SICOE Obra/)
    assert.match(formSrc, /PlanillaTuberiaCrearReporteModal/)
    assert.match(formSrc, /crear-reporte-sicoe/)
    assert.match(modalSrc, /Subcontratista/)
    assert.match(modalSrc, /Inspector/)
    assert.match(modalSrc, /Capítulo/)
    assert.match(modalSrc, /Nodo inicio/)
    assert.match(modalSrc, /Nodo fin/)
  })

  it('backend expone endpoint crear-reporte-sicoe y por-reporte', () => {
    assert.match(routesSrc, /crear-reporte-sicoe/)
    assert.match(routesSrc, /por-reporte-sicoe/)
    assert.match(routesSrc, /lineas_planilla_a_registros_sicoe/)
    assert.match(routesSrc, /Sin Asignar Ítem/)
  })

  it('lineasPlanillaParaReporteSicoe omite ceros y mapea nombres', () => {
    const lineas = lineasPlanillaParaReporteSicoe({
      netos: [
        { codigo: 'EXC', nombre: 'Excavación Varias', neto: 12, unidad: 'm³' },
        { codigo: 'OTROS', nombre: 'Otros: ____', neto: 0 },
      ],
      descuentos: [
        { codigo: 'DESC_A1', nombre: 'Area 1', cantidad: 1.5, unidad: 'm³' },
      ],
    })
    assert.equal(lineas.length, 2)
    assert.equal(lineas[0].nombre, 'Excavación Varias')
    assert.equal(lineas[1].nombre, 'Area 1')
  })

  it('abscisasExtremos y links meta', () => {
    const abs = abscisasExtremosPlanilla(
      { cartera: { totales: { abscisa_inicial: 1.5, abscisa_final: 9.2 } } },
      [],
    )
    assert.equal(abs.absInicio, 1.5)
    assert.equal(abs.absFinal, 9.2)
    const absFilas = abscisasExtremosPlanilla(
      { cartera: { totales: { abscisa_inicial: 0, abscisa_final: 99 } } },
      [{ abscisa: 10 }, { abscisa: 20 }],
    )
    assert.equal(absFilas.absInicio, 10)
    assert.equal(absFilas.absFinal, 20)
    const links = linksSicoeDesdeMeta({
      sicoe_reportes: [{ reporte_id: 7, numero_reporte: 3 }],
    })
    assert.equal(links.length, 1)
    assert.equal(links[0].reporte_id, 7)
  })

  it('bloquea Crear reporte tras el primer envío (salvo Desarrollador)', () => {
    const links = [{ reporte_id: 7, numero_reporte: 3 }]
    assert.equal(puedeCrearReporteSicoe({ esDesarrollador: false, linksSicoe: links }), false)
    assert.equal(puedeCrearReporteSicoe({ esDesarrollador: false, linksSicoe: [] }), true)
    assert.equal(puedeCrearReporteSicoe({ esDesarrollador: true, linksSicoe: links }), true)
    assert.equal(puedeCrearReporteSicoe({ esDesarrollador: true, linksSicoe: [] }), true)
    assert.match(formSrc, /puedeCrearReporteSicoe/)
    assert.match(formSrc, /data-reporte-sicoe-bloqueado/)
    assert.match(formSrc, /Reporte creado/)
    assert.match(formSrc, /!puedeCrearReporte/)
    assert.match(formSrc, /data-reporte-sicoe-reenvio-dev/)
  })

  it('visibilidad del botón exige permiso crear/editar SICOE (so_registros)', () => {
    assert.match(formSrc, /puedeVerBotonCrearReporteSicoe/)
    assert.match(formSrc, /puedeVerCrearReporte/)
    assert.match(formSrc, /planilla\?\.id && puedeVerCrearReporte/)
  })
})
