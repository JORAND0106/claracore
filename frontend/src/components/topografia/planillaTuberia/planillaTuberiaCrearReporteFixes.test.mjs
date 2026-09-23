/**
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaCrearReporteFixes.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { filtrarCapitulosPorTipoPlanilla } from './planillaTuberiaCrearReporteUi.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const modalSrc = readFileSync(join(dir, 'PlanillaTuberiaCrearReporteModal.jsx'), 'utf8')
const routesSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_routes.py'),
  'utf8',
)

describe('Crear reporte — fixes múltiples', () => {
  it('filtra capítulos por tipo de planilla', () => {
    const caps = [
      '3. OBRAS DE ARTE (ALCANTARILLA)',
      '4. FILTROS DE PAVIMENTO',
      '1. MOVIMIENTO DE TIERRAS',
    ]
    assert.deepEqual(
      filtrarCapitulosPorTipoPlanilla(caps, 'FILTRO'),
      ['4. FILTROS DE PAVIMENTO'],
    )
    assert.ok(filtrarCapitulosPorTipoPlanilla(caps, 'ALCANTARILLA').includes(
      '3. OBRAS DE ARTE (ALCANTARILLA)',
    ))
  })

  it('popup más ancho, fila superior de 5 y sin leyendas superfluas', () => {
    assert.match(modalSrc, /min\(980px/)
    assert.match(modalSrc, /data-crear-reporte-grid/)
    assert.match(modalSrc, /filtrarCapitulosPorTipoPlanilla/)
    assert.match(modalSrc, /data-capitulo-filtrado-tipo/)
    assert.match(modalSrc, /repeat\(5,\s*minmax\(0,\s*1fr\)\)/)
    assert.match(modalSrc, /data-crear-reporte-nodos-grid/)
    assert.doesNotMatch(modalSrc, /Filtrado por tipo de planilla/)
    assert.doesNotMatch(modalSrc, /Obligatorio\. Se abre el editor de Esquemas/)
  })

  it('ojo integrado en celda PK_ID (no toolbar suelta)', () => {
    assert.match(formSrc, /data-pk-id-con-ojo/)
    assert.match(formSrc, /data-icon-ojo-tramo/)
    assert.match(formSrc, /setTramoMapOpen\(true\)/)
    // No debe quedar AccionIcono de ojo suelto en la toolbar de acciones
    assert.doesNotMatch(formSrc, /AccionIcono[\s\S]{0,200}data-icon-ojo-tramo/)
  })

  it('backend: normaliza margen, bloquea reenvío y sincroniza so_registros', () => {
    assert.match(routesSrc, /normalizar_margen_sicoe/)
    assert.match(routesSrc, /Solo el rol Desarrollador puede reenviar/)
    assert.match(routesSrc, /_sincronizar_so_registros_desde_calc/)
    assert.match(routesSrc, /sicoe_sync/)
  })
})
