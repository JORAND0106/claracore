import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  coherenciaErrors,
  formConIdentidadPropagada,
  identidadInsumoDifiere,
  newCotizacionPar,
  propagarIdentidadInsumo,
  validateCaptureForEnviar,
} from './catalogoInsumosCotizaciones.js'
import { buildEditFormFromInsumoRow } from './catalogoInsumosProveedorEdit.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('unidad y rendimiento del catálogo', () => {
  it('propaga la unidad y el rendimiento a todas las cotizaciones', () => {
    const pares = [
      {
        ...newCotizacionPar({ esGanadora: true }),
        coherencia: { descripcion: 'CEMENTO', unidad: 'UND', rendimiento: '1' },
      },
      {
        ...newCotizacionPar(),
        coherencia: { descripcion: 'CEMENTO', unidad: 'UND', rendimiento: '1' },
      },
    ]
    const next = propagarIdentidadInsumo(pares, {
      descripcion: 'cemento',
      unidad: 'KG',
      rendimiento: '2,5',
    })
    assert.equal(next.length, 2)
    for (const par of next) {
      assert.equal(par.coherencia.descripcion, 'CEMENTO')
      assert.equal(par.coherencia.unidad, 'KG')
      assert.equal(par.coherencia.rendimiento, '2.5')
    }
    const form = formConIdentidadPropagada({
      descripcion: 'CEMENTO',
      unidad: 'KG',
      rendimiento: '2.5',
      razon_social: 'A',
      nit: '1',
      costo_base: '10',
      cotizacion_numero: 'A-1',
      cotizaciones_detalle: pares,
    })
    const check = validateCaptureForEnviar(form, form.cotizaciones_detalle)
    assert.deepEqual(coherenciaErrors(form.cotizaciones_detalle, form), [])
    assert.ok(!check.coherencia.some((e) => /unidad|rendimiento/i.test(e)))
  })

  it('al reabrir, todas las cotizaciones toman la unidad y el rendimiento del insumo', () => {
    const form = buildEditFormFromInsumoRow({
      descripcion: 'CEMENTO',
      unidad: 'KG',
      rendimiento: 4,
      cotizaciones_detalle: [
        { id: 'a-insumo', pair_id: 'a', tipo: 'insumo', es_ganadora: true, proveedor: 'A', valor: 10, numero: '1', coherencia: { unidad: 'UND', rendimiento: '1' } },
        { id: 'b-insumo', pair_id: 'b', tipo: 'insumo', es_ganadora: false, proveedor: 'B', valor: 12, numero: '2', coherencia: { unidad: 'M', rendimiento: '9' } },
      ],
    })
    assert.equal(form.unidad, 'KG')
    assert.equal(String(form.rendimiento), '4')
    assert.equal(form.cotizaciones_detalle.length, 2)
    for (const par of form.cotizaciones_detalle) {
      assert.equal(par.coherencia.unidad, 'KG')
      assert.equal(String(par.coherencia.rendimiento), '4')
    }
  })

  it('detecta cambio real y trata 1.50 igual que 1.5', () => {
    assert.equal(identidadInsumoDifiere({ unidad: 'und', rendimiento: '1.50' }, { unidad: 'UND', rendimiento: 1.5 }), false)
    assert.equal(identidadInsumoDifiere({ unidad: 'KG', rendimiento: '1' }, { unidad: 'UND', rendimiento: '1' }), true)
    assert.equal(identidadInsumoDifiere({ unidad: 'UND', rendimiento: '' }, { unidad: 'UND', rendimiento: '2' }), true)
  })

  it('la pantalla solo habilita unidad y rendimiento con Editar del catálogo', () => {
    const jsx = readFileSync(join(dir, 'SeccionCatalogoInsumos.jsx'), 'utf8')
    const api = readFileSync(join(dir, 'catalogoInsumosApi.js'), 'utf8')
    const main = readFileSync(join(dir, '../almacen/AlmacenMain.jsx'), 'utf8')
    const selector = readFileSync(join(dir, '../utils/unidadesListadoPrecios.jsx'), 'utf8')
    assert.match(jsx, /const identidadSoloLectura = Boolean\(editId && !canEditar\)/)
    assert.match(jsx, /permitirCustom=\{!editId\}/)
    assert.match(jsx, /data-testid="rendimiento-insumo"/)
    assert.match(jsx, /confirmar_cambio_identidad/)
    assert.match(jsx, /api\.usoInsumo\(/)
    assert.match(jsx, /titulo="Cambiar unidad o rendimiento"/)
    assert.match(jsx, /Consultar insumo/)
    const modal = jsx.slice(jsx.indexOf('confirmIdentidad &&'), jsx.indexOf('{confirmDiscard &&'))
    assert.doesNotMatch(modal, /fmtMoney/)
    assert.match(modal, /confirmIdentidad\.mensaje/)
    assert.match(api, /insumos\/\$\{insumoId\}\/uso/)
    assert.match(selector, /permitirCustom/)
    assert.match(main, /editar: Boolean\(permisos\?\.catalogo\?\.editar\)/)
    assert.doesNotMatch(main, /editar: Boolean\(permisos\?\.editar\)[\s\S]{0,80}catalogo/)
  })
})
