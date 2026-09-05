import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  collectPdfFilesFromPares,
  cotizacionesPayloadForSave,
  detalleToPares,
  ganadoraDesdeInsumoRow,
  newCotizacionPar,
  otrasCotizaciones,
  seedCotizacionPares,
  syncLegacyFromGanadora,
} from './catalogoInsumosCotizaciones.js'

describe('catalogoInsumosCotizaciones pares', () => {
  it('seed crea pares con ganadora e insumo+no_previsto', () => {
    const pares = seedCotizacionPares({ minPares: 3 })
    assert.equal(pares.length, 3)
    assert.equal(pares.filter((p) => p.es_ganadora).length, 1)
    assert.ok(pares.every((p) => p.insumo && p.no_previsto))
  })

  it('seed rellena desde legado en lado insumo', () => {
    const pares = seedCotizacionPares({
      minPares: 2,
      legacy: { cotizacion_numero: 'COT-9', cotizacion_fecha: '2026-01-15', cotizacion_vigencia: '30 días' },
      proveedorNombre: 'Acme',
      costoBase: '1500',
    })
    const gan = pares.find((p) => p.es_ganadora)
    assert.equal(gan.insumo.numero, 'COT-9')
    assert.equal(gan.insumo.proveedor, 'Acme')
    assert.equal(gan.insumo.valor, '1500')
  })

  it('payload empareja con pair_id y sync legado', () => {
    const pares = seedCotizacionPares({ minPares: 1 })
    pares[0].es_ganadora = true
    pares[0].insumo.numero = 'G-1'
    pares[0].insumo.fecha = '2026-02-01'
    pares[0].no_previsto.numero = 'NP-1'
    pares[0].no_previsto.valor = '2000'
    const legacy = syncLegacyFromGanadora(pares)
    assert.equal(legacy.cotizacion_numero, 'G-1')
    const payload = cotizacionesPayloadForSave(pares)
    assert.equal(payload.length, 2)
    assert.equal(payload[0].pair_id, pares[0].id)
    assert.equal(payload[0].tipo, 'insumo')
    assert.equal(payload[1].tipo, 'no_previsto')
  })

  it('detalleToPares reagrupa por pair_id', () => {
    const pares = detalleToPares([
      { id: 'a', pair_id: 'p1', tipo: 'insumo', es_ganadora: true, numero: 'G' },
      { id: 'b', pair_id: 'p1', tipo: 'no_previsto', numero: 'NP', valor: 10 },
      { id: 'c', pair_id: 'p2', tipo: 'insumo', numero: 'S' },
    ])
    assert.equal(pares.length, 2)
    assert.equal(pares[0].insumo.numero, 'G')
    assert.equal(pares[0].no_previsto.numero, 'NP')
    assert.equal(pares[1].insumo.numero, 'S')
  })

  it('collectPdfFilesFromPares separa ganadora y soportes', () => {
    const a = new File(['x'], 'gan.pdf', { type: 'application/pdf' })
    const b = new File(['y'], 'sop.pdf', { type: 'application/pdf' })
    const c = new File(['z'], 'np.pdf', { type: 'application/pdf' })
    const pares = [
      { ...newCotizacionPar({ esGanadora: true }), insumo: { ...newCotizacionPar().insumo, pdf: a }, no_previsto: { ...newCotizacionPar().no_previsto, pdf: c } },
      { ...newCotizacionPar(), insumo: { ...newCotizacionPar().insumo, pdf: b } },
    ]
    const { ganadora, soportes } = collectPdfFilesFromPares(pares)
    assert.equal(ganadora.name, 'gan.pdf')
    assert.deepEqual(soportes.map((f) => f.name).sort(), ['np.pdf', 'sop.pdf'])
  })

  it('ganadoraDesdeInsumoRow y otrasCotizaciones', () => {
    const fromDetalle = ganadoraDesdeInsumoRow({
      cotizaciones_detalle: [
        { pair_id: 'p1', tipo: 'insumo', es_ganadora: true, numero: 'A', valor: 10 },
        { pair_id: 'p1', tipo: 'no_previsto', numero: 'NP-1', valor: 20 },
      ],
    })
    assert.equal(fromDetalle.numero, 'A')
    const otras = otrasCotizaciones(
      detalleToPares([
        { pair_id: 'p1', tipo: 'insumo', es_ganadora: true, numero: 'G' },
        { pair_id: 'p1', tipo: 'no_previsto', numero: 'NP' },
        { pair_id: 'p2', tipo: 'insumo', numero: 'S' },
      ]),
      'p1',
    )
    assert.ok(otras.some((r) => r.numero === 'NP'))
    assert.ok(otras.some((r) => r.numero === 'S'))
  })
})
