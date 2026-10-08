import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aiuSobreCostoDirecto,
  confrontarContratoPresupuesto,
  desgloseValorContrato,
  elegirVersionPresupuestoComparacion,
  etiquetaVersionPresupuesto,
  sumaCostosAdicionales,
  textoAlertaConfrontacion,
} from './contratoFinanciero.js'

/** Cifras leídas del contrato ICCU-CTO-1614-2025 (id 3) y del presupuesto de obra vivo. */
const ICCU = {
  costo_directo_contrato: 19972056783,
  aiu: null,
  iva: null,
  valor_componente_ambiental: 164344800,
  valor_componente_social: null,
  valor_componente_pmt: 154721200,
  anticipo: 6203753699,
  costos_adicionales_lista: [
    {
      valor: 200000000,
      tiempo_meses: 1,
      valor_mensual: 200000000,
      concepto_contractual: 'PROVISIÓN PARA AJUSTE POR POSIBLE VARIACIÓN COSTOS EN INSUMOS',
    },
    {
      valor: 188056213,
      tiempo_meses: 1,
      valor_mensual: 188056213,
      concepto_contractual: 'REVISION, AJUSTE Y/O ACTUALIZACION Y/O COMPLEMENTACION DE LOS ESTUDIOS Y DISEÑOS',
    },
  ],
}

describe('valor total del contrato', () => {
  it('ICCU-CTO-1614-2025 suma CD + AIU + ambiental + social + PMT + adicionales, sin anticipo', () => {
    const d = desgloseValorContrato(ICCU)
    assert.equal(d.costoDirecto, 19972056783)
    assert.equal(d.aiu, 0)
    assert.equal(d.ambiental, 164344800)
    assert.equal(d.social, 0)
    assert.equal(d.pmt, 154721200)
    assert.equal(d.adicionales, 388056213)
    assert.equal(d.total, 19972056783 + 164344800 + 154721200 + 388056213)
    assert.equal(d.total, 20679178996)
    assert.ok(d.total > ICCU.anticipo)
    assert.equal(d.comparable, 19972056783)
  })

  it('el AIU se redondea a 0 decimales y el total se actualiza con la tasa', () => {
    const d = desgloseValorContrato({
      costo_directo_contrato: '1000',
      aiu: '0.255',
      valor_componente_ambiental: '10.4',
      valor_componente_social: '',
      valor_componente_pmt: '20',
      costos_adicionales_lista: [{ valor_mensual: '100.4', tiempo_meses: '2' }],
    })
    assert.equal(aiuSobreCostoDirecto(1000, 0.255), 255)
    assert.equal(d.aiu, 255)
    assert.equal(d.ambiental, 10)
    assert.equal(d.adicionales, 201)
    assert.equal(d.total, 1000 + 255 + 10 + 0 + 20 + 201)
  })

  it('un renglón a medio llenar no suma y el valor legado se usa si faltan meses', () => {
    assert.equal(sumaCostosAdicionales([{ valor_mensual: '50', tiempo_meses: '' }]), 0)
    assert.equal(sumaCostosAdicionales([{ valor: 80 }]), 80)
  })
})

describe('versión vigente del presupuesto', () => {
  const v0 = { id: 'a', numero_version: 1, etiqueta: 'Inicial', snapshot_tipo: 'inicial', costo_directo_total: 100 }
  const v2 = { id: 'b', numero_version: 2, etiqueta: 'V2', snapshot_tipo: 'completo', costo_directo_total: 200, creada_en: '2026-01-01' }
  const v3 = { id: 'c', numero_version: 3, etiqueta: 'V3', snapshot_tipo: 'completo', costo_directo_total: 300, creada_en: '2026-06-01' }

  it('sin actualizaciones usa V0', () => {
    const elegida = elegirVersionPresupuestoComparacion([v0])
    assert.equal(elegida.id, 'a')
    assert.equal(etiquetaVersionPresupuesto(elegida, [v0]), 'V0')
  })

  it('con actualizaciones usa la de mayor número, no V0', () => {
    const elegida = elegirVersionPresupuestoComparacion([v3, v0, v2])
    assert.equal(elegida.id, 'c')
    assert.equal(etiquetaVersionPresupuesto(elegida, [v0, v2, v3]), 'V3')
  })

  it('sin snapshot_tipo, la de menor número es V0', () => {
    const solo = [{ id: 'z', numero_version: 4, etiqueta: 'Base', costo_directo_total: 1 }]
    assert.equal(etiquetaVersionPresupuesto(elegirVersionPresupuestoComparacion(solo), solo), 'Base (V0)')
  })
})

describe('confrontación de mismo alcance', () => {
  it('ICCU coincide con el presupuesto vivo y no arma alerta', () => {
    const versiones = [{
      id: 'vivo',
      numero_version: 1,
      etiqueta: 'Inicial',
      snapshot_tipo: 'inicial',
      es_vigente: true,
      costo_directo_total: 19972056783,
    }]
    const c = confrontarContratoPresupuesto(ICCU, versiones)
    assert.equal(c.comparable, true)
    assert.equal(c.coincide, true)
    assert.equal(c.etiquetaVersion, 'V0')
    assert.equal(c.valorContrato, 19972056783)
    assert.equal(c.valorPresupuesto, 19972056783)
    assert.equal(c.diferencia, 0)
    assert.equal(c.alcance, 'Costo directo + AIU')
    assert.equal(textoAlertaConfrontacion(c), '')
    assert.notEqual(c.desglose.total, c.valorContrato)
  })

  it('una diferencia de costo directo arma la alerta con versión, valores y diferencia', () => {
    const contrato = { costo_directo_contrato: 1000, aiu: 0.1, valor_componente_ambiental: 500 }
    const versiones = [
      { id: 'a', numero_version: 1, etiqueta: 'Inicial', snapshot_tipo: 'inicial', costo_directo_total: 1000 },
      { id: 'b', numero_version: 2, etiqueta: 'V2', snapshot_tipo: 'completo', costo_directo_total: 800 },
    ]
    const c = confrontarContratoPresupuesto(contrato, versiones)
    assert.equal(c.etiquetaVersion, 'V2')
    assert.equal(c.valorContrato, 1100)
    assert.equal(c.valorPresupuesto, 880)
    assert.equal(c.diferencia, -220)
    assert.equal(c.coincide, false)
    const texto = textoAlertaConfrontacion(c)
    assert.match(texto, /presupuesto V2/)
    assert.match(texto, /Contrato: 1100/)
    assert.match(texto, /Presupuesto V2: 880/)
    assert.match(texto, /Diferencia: 220/)
    assert.match(texto, /el contrato es mayor/)
  })

  it('sin versiones no hay alerta', () => {
    const c = confrontarContratoPresupuesto(ICCU, [])
    assert.equal(c.comparable, false)
    assert.equal(c.coincide, null)
    assert.equal(textoAlertaConfrontacion(c), '')
  })
})
