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
  etiquetaItem,
  lineasSinItem,
  padreDeDescuento,
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
