/**
 * Traslapo geotextil (FILTRO): obligatorio en cabecera; suma al ancho promedio → GEO.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaTraslapo.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calcularPlanillaLocal } from './planillaTuberiaCalc.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const excelSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_excel.py'),
  'utf8',
)
const pdfSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_pdf.py'),
  'utf8',
)
const routesSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_routes.py'),
  'utf8',
)

const filasFiltro = [
  {
    orden: 1, abscisa: 100, terreno_natural: 105,
    terminado_filtro: 104.2, cota_fondo_excavacion: 102.8,
  },
  {
    orden: 2, abscisa: 110, terreno_natural: 104.95,
    terminado_filtro: 104.17, cota_fondo_excavacion: 102.76,
  },
  {
    orden: 3, abscisa: 120, terreno_natural: 104.9,
    terminado_filtro: 104.14, cota_fondo_excavacion: 102.72,
  },
]

describe('Traslapo geotextil — FILTRO', () => {
  it('motor: GEO = L × (prom_ancho_geotextil + traslapo)', () => {
    const base = calcularPlanillaLocal({
      tipo: 'FILTRO',
      diametro_m: 0.6,
      espesor_m: 0.03,
      ancho_excavacion_m: 1.2,
      relacion_atraque: '1:4',
      filas_campo: filasFiltro,
      traslapo_m: 0,
    })
    assert.ok(base)
    const prom = base.cartera.totales.prom_ancho_geotextil
    assert.ok(prom > 0, `prom geotextil esperado > 0, got ${prom}`)
    const geo0 = base.netos.find((n) => n.codigo === 'GEO')
    const L = base.cartera.totales.longitud_m
    assert.ok(Math.abs(geo0.neto - Math.round(L * prom * 100) / 100) < 0.02)

    const conTr = calcularPlanillaLocal({
      tipo: 'FILTRO',
      diametro_m: 0.6,
      espesor_m: 0.03,
      ancho_excavacion_m: 1.2,
      relacion_atraque: '1:4',
      filas_campo: filasFiltro,
      traslapo_m: 0.3,
    })
    const geo1 = conTr.netos.find((n) => n.codigo === 'GEO')
    const esperado = Math.round(L * (prom + 0.3) * 100) / 100
    assert.ok(Math.abs(geo1.neto - esperado) < 0.02, `GEO=${geo1.neto} esperado≈${esperado}`)
    assert.ok(Math.abs(geo1.ancho - (prom + 0.3)) < 0.02)
    // Cartera prom sin cambiar
    assert.ok(Math.abs(conTr.cartera.totales.prom_ancho_geotextil - prom) < 1e-9)
  })

  it('ALCANTARILLA: traslapo no se aplica (seccion.traslapo_m = 0)', () => {
    const sin = calcularPlanillaLocal({
      tipo: 'ALCANTARILLA',
      diametro_m: 0.9,
      espesor_m: 0.05,
      ancho_excavacion_m: 1.5,
      relacion_atraque: '1:3',
      cama_triturado_m: 0.1,
      traslapo_m: 0,
      filas_campo: [
        { orden: 1, abscisa: 100, terreno_natural: 100, subrasante_via: 99, cota_fondo_excavacion: 98 },
        { orden: 2, abscisa: 120, terreno_natural: 100, subrasante_via: 99, cota_fondo_excavacion: 98 },
      ],
    })
    const con = calcularPlanillaLocal({
      tipo: 'ALCANTARILLA',
      diametro_m: 0.9,
      espesor_m: 0.05,
      ancho_excavacion_m: 1.5,
      relacion_atraque: '1:3',
      cama_triturado_m: 0.1,
      traslapo_m: 5,
      filas_campo: [
        { orden: 1, abscisa: 100, terreno_natural: 100, subrasante_via: 99, cota_fondo_excavacion: 98 },
        { orden: 2, abscisa: 120, terreno_natural: 100, subrasante_via: 99, cota_fondo_excavacion: 98 },
      ],
    })
    assert.equal(con.seccion.traslapo_m, 0)
    const geoSin = sin.netos.find((n) => n.codigo === 'GEO')
    const geoCon = con.netos.find((n) => n.codigo === 'GEO')
    assert.equal(geoSin.neto, geoCon.neto)
    assert.equal(geoSin.ancho, geoCon.ancho)
  })

  it('UI: campo Traslapo en FILTRO + validación obligatoria', () => {
    assert.match(formSrc, /traslapo_m/)
    assert.match(formSrc, /Traslapo \*/)
    assert.match(formSrc, /validarTraslapoFiltro/)
    assert.match(formSrc, /Traslapo es obligatorio en planillas tipo FILTRO/)
  })

  it('BE/Excel/PDF: traslapo en cabecera y fórmula GEO', () => {
    assert.match(routesSrc, /_assert_traslapo_filtro/)
    assert.match(routesSrc, /traslapo_m=_traslapo_m/)
    assert.match(excelSrc, /Traslapo/)
    assert.match(excelSrc, /J41.*\$F\$15/)
    assert.match(pdfSrc, /Traslapo/)
  })
})
