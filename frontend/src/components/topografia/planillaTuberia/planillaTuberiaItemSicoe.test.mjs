/**
 * Ejecutar: node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaItemSicoe.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  aplicarDimsEnlace,
  capituloParaPrecioItem,
  clavePrecioCapItem,
  etiquetaItem,
  capituloItemDistinto,
  lineasSinItem,
  lineasSinPrecio,
  mensajeCapituloDistinto,
  mensajeFaltanPrecios,
  padreDeDescuento,
  precioListadoUsable,
} from './planillaTuberiaItemSicoe.js'

const dir = dirname(fileURLToPath(import.meta.url))
const form = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const app = readFileSync(join(dir, '../../../App.jsx'), 'utf8')
const modal = readFileSync(join(dir, 'PlanillaTuberiaCrearReporteModal.jsx'), 'utf8')

describe('ítem de cobro en la planilla', () => {
  it('el descuento hereda el ítem de la línea y exige ítem para crear', () => {
    assert.equal(padreDeDescuento('DESC_A1'), 'cantidades:TRI')
    assert.equal(padreDeDescuento('DESC_A2'), 'cantidades:REL')
    assert.equal(padreDeDescuento('DESC_TUB_FILT'), 'cantidades:TRI')
    assert.equal(padreDeDescuento('DESC_OTROS_1'), 'cantidades:EXC')
    assert.equal(padreDeDescuento('DESC_VOL_EXC_ROC', 'REL'), 'cantidades:REL')
    const items = { 'cantidades:TRI': { item_numero: '1.02', descripcion: 'Triturado' } }
    const faltan = lineasSinItem([
      { scope: 'cantidades', codigo: 'EXC', nombre: 'Excavación' },
      { scope: 'descuentos', codigo: 'DESC_A1', nombre: 'Area 1', item_cant_codigo: 'TRI' },
    ], items)
    assert.deepEqual(faltan.map((f) => f.origen), ['cantidades:EXC'])
    assert.match(etiquetaItem(items['cantidades:TRI']), /1\.02/)
  })

  it('la columna vive en la planilla y el alta va a Ítem/Registros', () => {
    assert.match(form, /Ítem cobro/)
    assert.match(form, /PlanillaTuberiaItemCobro/)
    assert.match(form, /puedeAsignarItem/)
    assert.match(form, /Reabrir planilla/)
    assert.match(form, /Ítem\/Registros/)
    assert.match(modal, /Ítem\/Registros/)
    assert.match(modal, /sicoe_items_por_linea/)
    assert.doesNotMatch(form, /preacta_obra/)
  })

  it('el ícono de SICOE Obra reutiliza el indicador para quien edita cantidades', () => {
    assert.match(app, /alerta-sync-cantidades/)
    assert.match(app, /usuarioPuedeEditarRegistrosSicoe/)
    assert.match(app, /alertaSyncCantidades/)
    assert.match(app, /IconoModuloConAlerta icon=\{icon\} total=\{alertaIcono\}/)
  })

  it('bloquea crear reporte si el ítem no tiene precio en su propio capítulo', () => {
    assert.equal(precioListadoUsable(0), false)
    assert.equal(precioListadoUsable(null), false)
    assert.equal(precioListadoUsable(12.5), true)
    const capReporte = '3. OBRAS DE ARTE (ALCANTARILLA)'
    const capExc = '1. ACTIVIDADES PRELIMINARES'
    const capTri = 'Filtros'
    const lineas = [
      { scope: 'cantidades', codigo: 'EXC', nombre: 'Excavación Varias' },
      { scope: 'cantidades', codigo: 'TRI', nombre: 'Atraque' },
      { scope: 'descuentos', codigo: 'DESC_A1', nombre: 'Area 1', item_cant_codigo: 'TRI' },
    ]
    const items = {
      'cantidades:EXC': { item_numero: '1.1.', precio_unitario: 1000, capitulo: capExc },
      'cantidades:TRI': { item_numero: 'NP-08.', precio_unitario: 2000, capitulo: capTri },
    }
    assert.equal(capituloParaPrecioItem(items['cantidades:EXC'], capReporte), capExc)
    // Mapa con precio solo en el capítulo del reporte → no vale para ítems de otro cap.
    const preciosSoloReporte = {
      [clavePrecioCapItem(capReporte, '1.1.')]: 1000,
      [clavePrecioCapItem(capReporte, 'NP-08.')]: 2000,
    }
    const faltan = lineasSinPrecio(lineas, items, preciosSoloReporte, capReporte)
    assert.deepEqual(faltan.map((f) => f.item_numero).sort(), ['1.1.', 'NP-08.'])
    assert.match(mensajeFaltanPrecios(faltan), /faltan precios en el listado/)
    // Con precio en el capítulo propio de cada ítem → no bloquea (aunque el reporte sea otro).
    const preciosPropios = {
      [clavePrecioCapItem(capExc, '1.1.')]: 1000,
      [clavePrecioCapItem(capTri, 'NP-08.')]: 2100,
    }
    assert.deepEqual(lineasSinPrecio(lineas, items, preciosPropios, capReporte), [])
    // Sin precio en el capítulo propio → sí bloquea.
    const sinTri = { [clavePrecioCapItem(capExc, '1.1.')]: 1000 }
    assert.deepEqual(
      lineasSinPrecio(lineas, items, sinTri, capReporte).map((f) => f.item_numero),
      ['NP-08.'],
    )
    assert.match(modal, /fetchPreciosPorItemsAsignados/)
    assert.match(modal, /lineasSinPrecio/)
    assert.match(modal, /mensajeFaltanPrecios/)
  })

  it('el capítulo distinto pregunta si continúa y el mismo capítulo no', () => {
    const capItem = '1. ACTIVIDADES PRELIMINARES, EXPLANACIONES Y EXCAVACIONES'
    const capReporte = '3. OBRAS DE ARTE (ALCANTARILLA)'
    const item = { item_numero: '1.1.', capitulo: capItem, descripcion: 'Excavación' }
    const lineas = [
      { scope: 'cantidades', codigo: 'EXC', nombre: 'Excavación' },
      { scope: 'descuentos', codigo: 'DESC_A1', nombre: 'Area 1', item_cant_codigo: 'TRI' },
    ]
    const items = {
      'cantidades:EXC': item,
      'cantidades:TRI': { item_numero: '1.02', capitulo: capReporte },
    }
    const aviso = mensajeCapituloDistinto(lineas, items, capReporte)
    assert.equal(
      aviso,
      `El ítem 1.1. pertenece al capítulo «${capItem}» y el reporte usa «${capReporte}».`,
    )
    assert.equal(mensajeCapituloDistinto(
      [{ scope: 'cantidades', codigo: 'EXC', nombre: 'Excavación' }],
      { 'cantidades:EXC': { ...item, capitulo: capReporte } },
      capReporte,
    ), '')
    assert.equal(capituloItemDistinto({ item_numero: '1.1.' }, capReporte), false)
    assert.match(modal, /TopoConfirmModal/)
    assert.match(modal, /¿Desea continuar\?/)
    assert.match(modal, /confirmLabel="Sí"/)
    assert.match(modal, /cancelLabel="No"/)
    assert.match(modal, /CREAR_REPORTE_CONFIRMA_Z_INDEX/)
    assert.match(modal, /crear\(false\)/)
    assert.match(modal, /crear\(true\)/)
    assert.doesNotMatch(modal, /pertenece al capítulo/)
  })

  it('el empuje del reporte actualiza la cantidad y cae si la base cambió', () => {
    const calc = {
      netos: [{ codigo: 'EXC', long: 10, ancho: 1, espesor: 1, bruto: 10, neto: 8 }],
      descuentos: [],
    }
    const dims = {
      'cantidades:EXC': {
        long: 12, ancho: 1, espesor: 1, cantidad: 12,
        base: { long: 10, ancho: 1, espesor: 1, cantidad: 10 },
      },
    }
    const aplicado = aplicarDimsEnlace(calc, dims)
    assert.equal(aplicado.netos[0].bruto, 12)
    assert.equal(aplicado.netos[0].neto, 10)
    const movida = aplicarDimsEnlace({
      netos: [{ codigo: 'EXC', long: 20, ancho: 1, espesor: 1, bruto: 20, neto: 20 }],
      descuentos: [],
    }, dims)
    assert.equal(movida.netos[0].bruto, 20)
  })
})
