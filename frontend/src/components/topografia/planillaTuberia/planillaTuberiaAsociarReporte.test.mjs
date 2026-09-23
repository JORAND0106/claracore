/**
 * Asociar planilla a reporte SICOE existente + sin alerta Nivel sobre TN.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaAsociarReporte.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validarFilasCarteraLocal } from './planillaTuberiaUtils.js'
import {
  filtrarReportesSicoeAutocomplete,
  formatoPreviewReporteSicoe,
} from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const modalSrc = readFileSync(join(dir, 'PlanillaTuberiaAsociarReporteModal.jsx'), 'utf8')
const utilsSrc = readFileSync(join(dir, 'planillaTuberiaUtils.js'), 'utf8')
const routesSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_routes.py'),
  'utf8',
)
const motorSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia.py'),
  'utf8',
)

describe('Asociar planilla a reporte SICOE existente', () => {
  it('UI expone botón y modal de asociar', () => {
    assert.match(formSrc, /PlanillaTuberiaAsociarReporteModal/)
    assert.match(formSrc, /data-asociar-reporte-sicoe-btn/)
    assert.match(formSrc, /Asociar a reporte SICOE existente/)
    assert.match(formSrc, /asociar-reporte-sicoe/)
    assert.match(formSrc, /token=\{token\}/)
    assert.match(modalSrc, /Asociar a reporte existente/)
    assert.match(modalSrc, /data-asociar-numero-reporte/)
    assert.match(modalSrc, /data-asociar-esquema-btn/)
    assert.match(modalSrc, /al Guardar se sincronizan/i)
  })

  it('mini tabla de cantidades con checks desmarcados por defecto', () => {
    assert.match(modalSrc, /data-asociar-cantidades-tabla/)
    assert.match(modalSrc, /data-asociar-linea-check/)
    assert.match(modalSrc, /origenKeyLineaAsociarSicoe/)
    assert.match(modalSrc, /origenes_seleccionados/)
    assert.match(modalSrc, /Desmarcadas por defecto/)
    assert.match(modalSrc, /Sin Asignar Ítem/)
    assert.match(utilsSrc, /export function origenKeyLineaAsociarSicoe/)
    assert.match(modalSrc, /useState\(\(\) => new Set\(\)\)/)
  })

  it('origenKeyLineaAsociarSicoe arma scope:codigo', async () => {
    const { origenKeyLineaAsociarSicoe } = await import('./planillaTuberiaUtils.js')
    assert.equal(
      origenKeyLineaAsociarSicoe({ scope: 'cantidades', codigo: 'EXC' }),
      'cantidades:EXC',
    )
    assert.equal(
      origenKeyLineaAsociarSicoe({ scope: 'descuentos', codigo: 'DESC_A1' }),
      'descuentos:DESC_A1',
    )
  })

  it('busca reportes existentes con autocomplete y preview Nº & Descripción & Abs', () => {
    assert.match(modalSrc, /reportes\/buscar/)
    assert.match(modalSrc, /formatoPreviewReporteSicoe/)
    assert.match(modalSrc, /filtrarReportesSicoeAutocomplete/)
    assert.match(modalSrc, /data-asociar-reporte-sugerencias/)
    assert.match(modalSrc, /data-asociar-reporte-seleccionado/)
    assert.match(utilsSrc, /\$\{num\} & \$\{desc\} & \$\{absTxt\}/)

    const preview = formatoPreviewReporteSicoe({
      numero_reporte: 128,
      descripcion_actividad: 'Tubería PK-12',
      abs_inicio: 100.5,
      abs_final: 250,
    })
    assert.equal(preview, '128 & Tubería PK-12 & 100.5 - 250')

    const lista = [
      { id: 1, numero_reporte: 10, descripcion_actividad: 'Filtro norte', abs_inicio: 1, abs_final: 2 },
      { id: 2, numero_reporte: 128, descripcion_actividad: 'Tubería PK-12', abs_inicio: 100, abs_final: 200 },
      { id: 3, numero_reporte: 50, descripcion_actividad: 'Otro', abs_inicio: 5, abs_final: 6 },
    ]
    const byNum = filtrarReportesSicoeAutocomplete(lista, '128')
    assert.equal(byNum.length, 1)
    assert.equal(byNum[0].id, 2)
    const byDesc = filtrarReportesSicoeAutocomplete(lista, 'filtro')
    assert.equal(byDesc.length, 1)
    assert.equal(byDesc[0].id, 1)
  })

  it('backend asocia coords/fotos/gráfico y puede crear registros seleccionados', () => {
    assert.match(routesSrc, /asociar-reporte-sicoe/)
    assert.match(routesSrc, /def asociar_reporte_sicoe_existente/)
    assert.match(routesSrc, /solo_adjunto/)
    assert.match(routesSrc, /origenes_seleccionados/)
    assert.match(routesSrc, /n_registros_creados/)
    assert.match(routesSrc, /resolver_lineas_por_origenes_seleccionados/)
    assert.match(routesSrc, /No se encontraron en la planilla las líneas seleccionadas/)
    assert.match(routesSrc, /_reemplazar_puntos_topograficos_planilla/)
    assert.match(routesSrc, /El esquema del tramo es obligatorio/)
    const asociarBlock = routesSrc.slice(
      routesSrc.indexOf('def asociar_reporte_sicoe_existente'),
      routesSrc.indexOf('def cerrar('),
    )
    // Updates existentes + insert opcional de seleccionados
    assert.match(asociarBlock, /so_registros[\s\S]*\.update\(/)
    assert.match(asociarBlock, /\.insert\(rows_ins\)/)
    assert.match(asociarBlock, /Reemplazar gráfico en TODOS/)
    assert.match(asociarBlock, /\.eq\("reporte_id", int\(reporte_id\)\)/)
  })

  it('origenKey normaliza scope:CODIGO en mayúsculas', async () => {
    const { origenKeyLineaAsociarSicoe } = await import('./planillaTuberiaUtils.js')
    assert.equal(
      origenKeyLineaAsociarSicoe({ scope: 'Cantidades', codigo: 'exc' }),
      'cantidades:EXC',
    )
  })

  it('sync de cantidades incluye solo_adjunto mientras la planilla no esté sellada', () => {
    assert.match(routesSrc, /def _planilla_tuberia_sellada/)
    assert.match(routesSrc, /reason": "sellada"/)
    assert.match(routesSrc, /_mapa_codigos_por_nombre_registros/)
    assert.doesNotMatch(routesSrc, /if link\.get\("solo_adjunto"\)/)
    assert.match(formSrc, /sicoe_sync\?\.updated/)
    assert.match(formSrc, /Cantidades sincronizadas al reporte SICOE/)
  })

  it('asociar y crear se bloquean si ya hay vínculo SICOE', () => {
    assert.match(formSrc, /puedeAsociarReporteSicoe/)
    assert.match(formSrc, /!puedeAsociarReporte/)
    assert.match(routesSrc, /Solo el rol Desarrollador puede re-asociar/)
  })
})

describe('Validación cartera — sin alerta Nivel sobre TN', () => {
  it('no genera aviso cuando el nivel está sobre el TN', () => {
    const avisos = validarFilasCarteraLocal([
      {
        orden: 1, abscisa: 10, terreno_natural: 100,
        subrasante_via: 100.25, cota_fondo_excavacion: 98,
      },
    ], 'ALCANTARILLA')
    assert.equal(avisos.length, 0)
    assert.doesNotMatch(motorSrc, /Nivel sobre TN/)
  })

  it('sí alerta cuando CFE supera TN o el nivel', () => {
    const cfeTn = validarFilasCarteraLocal([
      {
        orden: 1, abscisa: 10, terreno_natural: 100,
        subrasante_via: 99, cota_fondo_excavacion: 100.5,
      },
    ], 'ALCANTARILLA')
    assert.ok(cfeTn.some((a) => a.msg === 'CFE > TN' && a.prioridad === 'error'))

    const nivelCfe = validarFilasCarteraLocal([
      {
        orden: 1, abscisa: 10, terreno_natural: 100,
        subrasante_via: 97, cota_fondo_excavacion: 98,
      },
    ], 'ALCANTARILLA')
    assert.ok(nivelCfe.some((a) => a.msg === 'Nivel < CFE' && a.prioridad === 'error'))
  })
})

describe('Listado planillas — etiquetas', () => {
  it('formatea validación y reportes asociados', async () => {
    const {
      etiquetaReportesAsociadosLista,
      etiquetaValidacionLista,
    } = await import('./planillaTuberiaUtils.js')
    assert.equal(etiquetaValidacionLista('No Revisado'), 'No Revisado')
    assert.equal(etiquetaValidacionLista(null), 'No Revisado')
    assert.match(etiquetaValidacionLista('Aprobado', '2026-09-23T15:00:00Z'), /^Aprobado · /)
    assert.equal(etiquetaReportesAsociadosLista({ reportes_sicoe: [] }), '—')
    assert.equal(
      etiquetaReportesAsociadosLista({
        reportes_sicoe: [
          { reporte_id: 1, numero_reporte: 12 },
          { reporte_id: 2, numero_reporte: 15 },
        ],
      }),
      '#12, #15',
    )
  })
})
