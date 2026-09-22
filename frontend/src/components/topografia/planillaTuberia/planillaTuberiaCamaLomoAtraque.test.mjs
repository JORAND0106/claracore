/**
 * Cama Triturado + Cota Lomo + desglose atraque (ALCANTARILLA).
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaCamaLomoAtraque.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  desgloseAtraqueAlcantarilla,
  filasDesdeApi,
  payloadFilas,
  fingerprintFilasCartera,
} from './planillaTuberiaUtils.js'
import { calcularPlanillaLocal } from './planillaTuberiaCalc.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('ALCANTARILLA — cama, cota lomo y desglose atraque', () => {
  it('UI expone Cama Triturado solo en ALC y columna Cota Lomo', () => {
    assert.match(formSrc, /Cama Triturado/)
    assert.match(formSrc, /cama_triturado_m/)
    assert.match(formSrc, /Cota Lomo/)
    assert.match(formSrc, /colsCampoEdit/)
    assert.match(formSrc, /desgloseAtraqueAlcantarilla/)
    assert.match(formSrc, /h<sub>atr<\/sub>/)
  })

  it('payloadFilas ALC mapea cota_lomo → terminado_filtro (persistencia)', () => {
    const payload = payloadFilas([
      {
        abscisa: 10, terreno_natural: 100, subrasante_via: 99.5,
        cota_lomo: 99.2, cota_fondo_excavacion: 98,
      },
    ], 'ALCANTARILLA')
    assert.equal(payload[0].subrasante_via, 99.5)
    assert.equal(payload[0].cota_lomo, 99.2)
    assert.equal(payload[0].terminado_filtro, 99.2)
  })

  it('filasDesdeApi ALC lee cota_lomo desde terminado_filtro si falta', () => {
    const rows = filasDesdeApi([
      { orden: 1, abscisa: 1, terreno_natural: 10, subrasante_via: 9.5, terminado_filtro: 9.2, cota_fondo_excavacion: 8 },
    ], 'ALCANTARILLA')
    assert.equal(rows[0].cota_lomo, 9.2)
    assert.equal(rows[0].terminado_filtro, '')
  })

  it('fingerprint usa cota_lomo o terminado_filtro de forma equivalente', () => {
    const a = fingerprintFilasCartera([
      { orden: 1, abscisa: 1, terreno_natural: 10, cota_fondo_excavacion: 8, subrasante_via: 9, cota_lomo: 9.1 },
    ])
    const b = fingerprintFilasCartera([
      { orden: 1, abscisa: 1, terreno_natural: 10, cota_fondo_excavacion: 8, subrasante_via: 9, terminado_filtro: 9.1 },
    ])
    assert.deepEqual(a, b)
  })

  it('desglose atraque: h=2r/N y (h+cama)·B − A1', () => {
    const calc = calcularPlanillaLocal({
      tipo: 'ALCANTARILLA',
      diametro_m: 0.9,
      espesor_m: 0.05,
      ancho_excavacion_m: 1.5,
      relacion_atraque: '1:3',
      cama_triturado_m: 0.1,
      filas_campo: [
        { orden: 1, abscisa: 0, terreno_natural: 100, subrasante_via: 99.5, cota_lomo: 99.2, cota_fondo_excavacion: 98 },
        { orden: 2, abscisa: 20, terreno_natural: 100.2, subrasante_via: 99.6, cota_lomo: 99.3, cota_fondo_excavacion: 98.1 },
      ],
    })
    assert.ok(calc?.seccion)
    const d = desgloseAtraqueAlcantarilla(calc.seccion)
    assert.ok(d)
    assert.equal(d.relacion, '1:3')
    assert.equal(d.denominador, 3)
    // h = 2*r/3 con r = 0.9/2+0.05 = 0.5 → h = 1/3 ≈ 0.333
    assert.ok(Math.abs(d.altura_atraque_m - 0.333) < 0.002)
    assert.ok(Math.abs(d.altura_triturado_m - (d.altura_atraque_m + 0.1)) < 1e-9)
    const expected = d.altura_triturado_m * 1.5 - d.area_1_m2
    assert.ok(Math.abs(d.seccion_atraque_m2 - expected) < 0.002)
  })

  it('perfil ALC incluye series subrasante y cota_lomo', () => {
    const calc = calcularPlanillaLocal({
      tipo: 'ALCANTARILLA',
      diametro_m: 0.9,
      espesor_m: 0,
      ancho_excavacion_m: 1.2,
      relacion_atraque: '1:3',
      cama_triturado_m: 0.05,
      filas_campo: [
        { orden: 1, abscisa: 0, terreno_natural: 100, subrasante_via: 99.5, cota_lomo: 99.1, cota_fondo_excavacion: 98 },
        { orden: 2, abscisa: 10, terreno_natural: 100.1, subrasante_via: 99.6, cota_lomo: 99.2, cota_fondo_excavacion: 98.05 },
      ],
    })
    assert.deepEqual(calc.perfil.cota_lomo, [99.1, 99.2])
    assert.deepEqual(calc.perfil.subrasante_via, [99.5, 99.6])
    assert.equal(calc.perfil.etiqueta_nivel, 'Cota Lomo')
  })

  it('FILTRO no recibe desglose ni campo cama en desglose helper', () => {
    const calc = calcularPlanillaLocal({
      tipo: 'FILTRO',
      diametro_m: 0.3,
      espesor_m: 0,
      ancho_excavacion_m: 0.8,
      relacion_atraque: '1:3',
      filas_campo: [
        { orden: 1, abscisa: 0, terreno_natural: 50, terminado_filtro: 49.5, cota_fondo_excavacion: 49 },
        { orden: 2, abscisa: 5, terreno_natural: 50.1, terminado_filtro: 49.6, cota_fondo_excavacion: 49.1 },
      ],
    })
    assert.equal(desgloseAtraqueAlcantarilla(calc.seccion), null)
    assert.equal(calc.perfil.subrasante_via, undefined)
  })
})
