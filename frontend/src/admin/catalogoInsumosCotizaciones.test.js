import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  cotizacionesPayloadForSave,
  ganadoraDesdeInsumoRow,
  normalizeCotizacionesDetalle,
  otrasCotizaciones,
  seedCotizacionesForm,
  syncLegacyFromGanadora,
} from './catalogoInsumosCotizaciones.js'

describe('catalogoInsumosCotizaciones', () => {
  it('seed crea filas insumo + no_previsto con una ganadora', () => {
    const rows = seedCotizacionesForm({ minInsumo: 3, minNoPrevisto: 2 })
    assert.equal(rows.filter((r) => r.tipo === 'insumo').length, 3)
    assert.equal(rows.filter((r) => r.tipo === 'no_previsto').length, 2)
    assert.equal(rows.filter((r) => r.es_ganadora).length, 1)
  })

  it('seed rellena desde legado de cotización ganadora', () => {
    const rows = seedCotizacionesForm({
      minInsumo: 3,
      legacy: { cotizacion_numero: 'COT-9', cotizacion_fecha: '2026-01-15', cotizacion_vigencia: '30 días' },
      proveedorNombre: 'Acme',
      costoBase: '1500',
    })
    const gan = rows.find((r) => r.es_ganadora)
    assert.equal(gan.numero, 'COT-9')
    assert.equal(gan.proveedor, 'Acme')
    assert.equal(gan.valor, '1500')
  })

  it('syncLegacyFromGanadora y payload omiten vacíos', () => {
    const rows = seedCotizacionesForm({ minInsumo: 2, minNoPrevisto: 1 })
    rows[0].numero = 'G-1'
    rows[0].fecha = '2026-02-01'
    rows[0].es_ganadora = true
    rows[1].numero = 'S-2'
    rows[1].proveedor = 'Otro'
    const legacy = syncLegacyFromGanadora(rows)
    assert.equal(legacy.cotizacion_numero, 'G-1')
    const payload = cotizacionesPayloadForSave(rows)
    assert.equal(payload.length, 2)
    assert.ok(payload.every((p) => p.numero))
  })

  it('ganadoraDesdeInsumoRow usa detalle o legado', () => {
    const fromDetalle = ganadoraDesdeInsumoRow({
      cotizaciones_detalle: [
        { tipo: 'insumo', es_ganadora: true, numero: 'A', valor: 10 },
        { tipo: 'no_previsto', numero: 'NP-1', valor: 20 },
      ],
    })
    assert.equal(fromDetalle.numero, 'A')
    const fromLegacy = ganadoraDesdeInsumoRow({
      cotizacion_numero: 'L-1',
      cotizacion_fecha: '2026-03-01',
      proveedor_nombre: 'Prov',
    })
    assert.equal(fromLegacy.numero, 'L-1')
  })

  it('otrasCotizaciones excluye ganadora e incluye no previstos', () => {
    const list = normalizeCotizacionesDetalle([
      { id: '1', tipo: 'insumo', es_ganadora: true, numero: 'G' },
      { id: '2', tipo: 'insumo', numero: 'S' },
      { id: '3', tipo: 'no_previsto', numero: 'NP' },
    ])
    const otras = otrasCotizaciones(list, '1')
    assert.deepEqual(otras.map((r) => r.numero), ['S', 'NP'])
  })
})
