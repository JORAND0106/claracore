/**
 * Motor local vs fórmulas del XLSM / backend.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaCalc.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  areaTuberiaM2,
  calcularPlanillaLocal,
  calcularSeccion,
  nombreTrituradoPorTipo,
  NOMBRE_TRI_ALCANTARILLA,
  NOMBRE_TRI_FILTRO,
} from './planillaTuberiaCalc.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('planillaTuberiaCalc — preview reactivo', () => {
  it('sección ALC: Ø=0.9 esp=0.05 B=1.2 rel 1:3', () => {
    const sec = calcularSeccion({
      tipo: 'ALCANTARILLA',
      diametro_m: 0.9,
      espesor_m: 0.05,
      ancho_excavacion_m: 1.2,
      relacion_atraque: '1:3',
    })
    assert.equal(sec.diametro_externo_m, 1.0)
    assert.ok(Math.abs(sec.altura_relleno_m - 0.333) < 1e-3)
    assert.ok(sec.area_tuberia_m2 > 0)
    assert.ok(sec.area_1_m2 >= 0)
    assert.ok(sec.area_2_m2 >= 0)
    assert.equal(areaTuberiaM2(0.9, 0.05), sec.area_tuberia_m2)
  })

  it('perfil y netos reaccionan a filas de cartera', () => {
    const calc = calcularPlanillaLocal({
      tipo: 'ALCANTARILLA',
      diametro_m: 0.9,
      espesor_m: 0.05,
      ancho_excavacion_m: 1.2,
      relacion_atraque: '1:3',
      filas_campo: [
        { orden: 1, abscisa: 1, terreno_natural: 100, subrasante_via: 99.5, cota_fondo_excavacion: 98 },
        { orden: 2, abscisa: 10, terreno_natural: 100.2, subrasante_via: 99.6, cota_fondo_excavacion: 98.1 },
      ],
    })
    assert.ok(calc)
    assert.equal(calc.perfil.abscisas.length, 2)
    assert.equal(calc.perfil.terreno_natural[0], 100)
    assert.ok(calc.cartera.totales.longitud_m > 0)
    assert.ok((calc.netos || []).some((n) => n.codigo === 'EXC' && n.neto != null))
    assert.ok((calc.cartera.filas[0].altura_excavacion) != null)
  })

  it('sin Ø/B no calcula (null)', () => {
    assert.equal(calcularPlanillaLocal({
      tipo: 'ALCANTARILLA',
      diametro_m: '',
      ancho_excavacion_m: 1.2,
      filas_campo: [{ orden: 1, abscisa: 1, terreno_natural: 10, cota_fondo_excavacion: 9 }],
    }), null)
  })

  it('Form usa calculoLocal / calculoVista para perfil y resumen', () => {
    assert.match(formSrc, /calcularPlanillaLocal/)
    assert.match(formSrc, /calculoLocal/)
    assert.match(formSrc, /calculoVista/)
    assert.match(formSrc, /calculoVista\?\.perfil/)
    assert.match(formSrc, /calculoVista\?\.netos/)
  })

  it('TRI: etiqueta dinámica por tipo; codigo TRI estable', () => {
    assert.equal(nombreTrituradoPorTipo('ALCANTARILLA'), 'Atraque mat. filtrante')
    assert.equal(nombreTrituradoPorTipo('FILTRO'), 'Mat. Granular Filtrante')
    assert.equal(NOMBRE_TRI_ALCANTARILLA, 'Atraque mat. filtrante')
    assert.equal(NOMBRE_TRI_FILTRO, 'Mat. Granular Filtrante')

    const base = {
      diametro_m: 0.9,
      espesor_m: 0.05,
      ancho_excavacion_m: 1.2,
      relacion_atraque: '1:3',
      filas_campo: [
        { orden: 1, abscisa: 1, terreno_natural: 100, subrasante_via: 99.5, cota_fondo_excavacion: 98 },
        { orden: 2, abscisa: 10, terreno_natural: 100.2, subrasante_via: 99.6, cota_fondo_excavacion: 98.1 },
      ],
      cama_triturado_m: 0.1,
    }
    const alc = calcularPlanillaLocal({ ...base, tipo: 'ALCANTARILLA' })
    const fil = calcularPlanillaLocal({
      ...base,
      tipo: 'FILTRO',
      filas_campo: [
        { orden: 1, abscisa: 1, terreno_natural: 100, terminado_filtro: 99.5, cota_fondo_excavacion: 98 },
        { orden: 2, abscisa: 10, terreno_natural: 100.2, terminado_filtro: 99.6, cota_fondo_excavacion: 98.1 },
      ],
    })
    const triAlc = alc.netos.find((n) => n.codigo === 'TRI')
    const triFil = fil.netos.find((n) => n.codigo === 'TRI')
    assert.equal(triAlc.codigo, 'TRI')
    assert.equal(triFil.codigo, 'TRI')
    assert.equal(triAlc.nombre, 'Atraque mat. filtrante')
    assert.equal(triFil.nombre, 'Mat. Granular Filtrante')
  })
})
