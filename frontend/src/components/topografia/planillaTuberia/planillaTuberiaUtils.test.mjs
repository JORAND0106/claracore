/**
 * Ejecutar: node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaUtils.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CALC_CELL_BG,
  confirmarGuardadoCartera,
  fingerprintFilasCartera,
  payloadFilas,
  tieneDatosExportables,
  TIPOS_PLANILLA,
  RELACIONES_ATRAQUE,
  FILAS_INICIALES_CARTERA,
  CARTERA_ROW_SCALE,
  RESUMEN_ROW_SCALE,
  SECCION_GRAFICO_SCALE,
  SECCION_MAX_HEIGHT,
  filasDesdeApi,
  filaCampoVacia,
  migrarFilasAlCambiarTipo,
  coordsGeoDesdePlanilla,
  payloadCoordsGeo,
  parseClipboardColumn,
  normalizarValorCeldaPaste,
  esPasteMasivo,
  aplicarPasteColumna,
} from './planillaTuberiaUtils.js'

describe('planillaTuberiaUtils', () => {
  it('filas iniciales = 2 y escalas de dimensión', () => {
    assert.equal(FILAS_INICIALES_CARTERA, 2)
    assert.equal(CARTERA_ROW_SCALE, 0.7)
    assert.equal(RESUMEN_ROW_SCALE, 0.5)
    assert.equal(SECCION_GRAFICO_SCALE, 1.6)
    assert.equal(SECCION_MAX_HEIGHT, 352)
    assert.equal(filasDesdeApi([], 'ALCANTARILLA').length, 2)
  })

  it('tipos y relaciones de atraque', () => {
    assert.deepEqual(TIPOS_PLANILLA.map((t) => t.value), ['ALCANTARILLA', 'FILTRO'])
    assert.deepEqual(RELACIONES_ATRAQUE, ['1:1', '1:2', '1:3', '1:4', '1:6'])
  })

  it('confirmarGuardadoCartera exige verified + count > 0 y huella', () => {
    assert.equal(confirmarGuardadoCartera(null, 2).ok, false)
    assert.equal(confirmarGuardadoCartera({ verified: false, count: 2 }, 2).ok, false)
    assert.equal(confirmarGuardadoCartera({ verified: true, count: 1 }, 2).ok, false)
    assert.equal(confirmarGuardadoCartera({ verified: true, count: 0 }, 0).ok, false)
    assert.equal(confirmarGuardadoCartera({ verified: true, count: 0 }, 2).ok, false)
    const ok = confirmarGuardadoCartera({ verified: true, count: 3, version: 5 }, 3)
    assert.equal(ok.ok, true)
    assert.equal(ok.version, 5)

    const payload = [
      { orden: 1, abscisa: 10, terreno_natural: 100, cota_fondo_excavacion: 98, subrasante_via: 99, terminado_filtro: null },
    ]
    const fp = fingerprintFilasCartera(payload)
    assert.equal(confirmarGuardadoCartera({
      verified: true,
      count: 1,
      fingerprint_orden: ['tampered'],
      filas_campo: payload,
    }, 1, payload).ok, false)
    const okFp = confirmarGuardadoCartera({
      verified: true,
      count: 1,
      version: 2,
      fingerprint_orden: fp,
      filas_campo: payload,
    }, 1, payload)
    assert.equal(okFp.ok, true)
  })

  it('payloadFilas usa numOrNull (descarta NaN) y mapea nivel por tipo', () => {
    const filas = [
      { abscisa: '10', terreno_natural: '100', subrasante_via: '99', terminado_filtro: '', cota_fondo_excavacion: '98', norte: '', este: '', observacion: '' },
      { abscisa: '', terreno_natural: '', subrasante_via: '', terminado_filtro: '', cota_fondo_excavacion: '', norte: '', este: '', observacion: '' },
      { abscisa: 'x', terreno_natural: '', subrasante_via: '', terminado_filtro: '', cota_fondo_excavacion: '', norte: '', este: '', observacion: '' },
    ]
    const alc = payloadFilas(filas, 'ALCANTARILLA')
    assert.equal(alc.length, 1)
    assert.equal(alc[0].subrasante_via, 99)
    assert.equal(alc[0].terminado_filtro, null)
    const fil = payloadFilas([
      { abscisa: '10', terreno_natural: '100', subrasante_via: '', terminado_filtro: '99.5', cota_fondo_excavacion: '98', norte: '', este: '', observacion: '' },
    ], 'FILTRO')
    assert.equal(fil[0].terminado_filtro, 99.5)
    assert.equal(fil[0].subrasante_via, null)
  })

  it('migrarFilasAlCambiarTipo copia nivel entre columnas', () => {
    const desdeAlc = migrarFilasAlCambiarTipo([
      { abscisa: '1', subrasante_via: '10.5', terminado_filtro: '' },
    ], 'FILTRO')
    assert.equal(desdeAlc[0].terminado_filtro, '10.5')
    const desdeFil = migrarFilasAlCambiarTipo([
      { abscisa: '1', subrasante_via: '', terminado_filtro: '11.2' },
    ], 'ALCANTARILLA')
    assert.equal(desdeFil[0].subrasante_via, '11.2')
  })

  it('coordsGeoDesdePlanilla lee meta y hace fallback a norte/este ref', () => {
    const fromMeta = coordsGeoDesdePlanilla({
      norte_ref: 1,
      este_ref: 2,
      meta_cabecera: {
        norte_abs_inicial: 10.5,
        este_abs_inicial: 20.5,
        norte_abs_final: 30.5,
        este_abs_final: 40.5,
      },
    })
    assert.equal(fromMeta.norte_abs_inicial, '10.5')
    assert.equal(fromMeta.este_abs_inicial, '20.5')
    assert.equal(fromMeta.norte_abs_final, '30.5')
    assert.equal(fromMeta.este_abs_final, '40.5')

    const fromRef = coordsGeoDesdePlanilla({ norte_ref: 9, este_ref: 8, meta_cabecera: {} })
    assert.equal(fromRef.norte_abs_inicial, '9')
    assert.equal(fromRef.este_abs_inicial, '8')
    assert.equal(fromRef.norte_abs_final, '')
    assert.equal(fromRef.este_abs_final, '')
  })

  it('payloadCoordsGeo sincroniza meta + norte_ref/este_ref de inicio', () => {
    const payload = payloadCoordsGeo({
      norte_abs_inicial: '100.25',
      este_abs_inicial: '200.5',
      norte_abs_final: '300',
      este_abs_final: '',
    })
    assert.equal(payload.norte_ref, 100.25)
    assert.equal(payload.este_ref, 200.5)
    assert.deepEqual(payload.meta_cabecera, {
      norte_abs_inicial: 100.25,
      este_abs_inicial: 200.5,
      norte_abs_final: 300,
      este_abs_final: null,
    })
  })

  it('tieneDatosExportables y fondo calculado #F2F2F2', () => {
    assert.equal(CALC_CELL_BG, '#F2F2F2')
    assert.equal(tieneDatosExportables([], null), false)
    assert.equal(tieneDatosExportables([
      { abscisa: '', terreno_natural: '', subrasante_via: '', terminado_filtro: '', cota_fondo_excavacion: '' },
    ], {}), false)
    assert.equal(tieneDatosExportables([
      { abscisa: '0', terreno_natural: '', subrasante_via: '', terminado_filtro: '', cota_fondo_excavacion: '' },
    ], {}), true)
    assert.equal(tieneDatosExportables([], {
      calculo: { cartera: { filas: [{ orden: 1, vacio: false, abscisa: 1 }] } },
    }), true)
  })

  it('parseClipboardColumn: salto de línea, TSV y coma decimal Excel', () => {
    assert.deepEqual(parseClipboardColumn('10\n20\n30\n'), ['10', '20', '30'])
    assert.deepEqual(parseClipboardColumn('10\r\n20\r\n'), ['10', '20'])
    // Varias columnas: solo la primera
    assert.deepEqual(parseClipboardColumn('1\t100\n2\t200\n'), ['1', '2'])
    assert.equal(normalizarValorCeldaPaste('10,5'), '10.5')
    assert.equal(normalizarValorCeldaPaste('1.234,56'), '1234.56')
    assert.deepEqual(parseClipboardColumn('10,25\n11,5\n'), ['10.25', '11.5'])
  })

  it('esPasteMasivo distingue pegado de una celda vs columna', () => {
    assert.equal(esPasteMasivo('42'), false)
    assert.equal(esPasteMasivo('10\n20'), true)
    assert.equal(esPasteMasivo('10\n'), true)
    assert.equal(esPasteMasivo(''), false)
    assert.equal(esPasteMasivo(null), false)
  })

  it('aplicarPasteColumna reparte valores y crea filas si hacen falta', () => {
    const base = [filaCampoVacia(1), filaCampoVacia(2)]
    const vals = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90']
    const out = aplicarPasteColumna(base, 0, 'abscisa', vals)
    assert.equal(out.length, 10)
    assert.deepEqual(out.map((f) => f.abscisa), vals)
    assert.deepEqual(out.map((f) => f.orden), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

    const desdeMitad = aplicarPasteColumna(base, 1, 'terreno_natural', ['100.1', '100.2', '100.3'])
    assert.equal(desdeMitad.length, 4)
    assert.equal(desdeMitad[0].terreno_natural, '')
    assert.equal(desdeMitad[1].terreno_natural, '100.1')
    assert.equal(desdeMitad[3].terreno_natural, '100.3')

    const cfe = aplicarPasteColumna(base, 0, 'cota_fondo_excavacion', ['90', '91'])
    assert.equal(cfe[0].cota_fondo_excavacion, '90')
    assert.equal(cfe[1].cota_fondo_excavacion, '91')
    // No toca otras columnas
    assert.equal(cfe[0].abscisa, '')
  })
})
