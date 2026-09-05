import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyAutoGanadoraByMinValor,
  buildParFromCapture,
  coherenciaErrors,
  collectPdfFilesFromPares,
  cotizacionesPayloadForSave,
  detalleToPares,
  ganadoraRuleErrors,
  ganadoraDesdeInsumoRow,
  newCotizacionPar,
  nextCotizacionNumero,
  seedCotizacionPares,
  syncLegacyFromGanadora,
  validateCaptureForEnviar,
  validateGuardarInsumo,
  applyPdfReplace,
  fileFromDataTransfer,
} from './catalogoInsumosCotizaciones.js'

describe('catalogoInsumosCotizaciones flujo enviar', () => {
  it('nextCotizacionNumero es consecutivo', () => {
    assert.equal(nextCotizacionNumero([]), 'COT-001')
    const pares = seedCotizacionPares({ minPares: 0 })
    const withOne = buildParFromCapture({
      razon_social: 'A', nit: '1', descripcion: 'Geo', unidad: 'M2', rendimiento: '1', costo_base: '100',
    }, pares)
    assert.equal(withOne[0].insumo.numero, 'COT-001')
    assert.equal(nextCotizacionNumero(withOne), 'COT-002')
  })

  it('applyAutoGanadoraByMinValor elige el menor valor insumo', () => {
    let pares = [
      { ...newCotizacionPar(), insumo: { ...newCotizacionPar().insumo, valor: '500', numero: 'COT-001' } },
      { ...newCotizacionPar(), insumo: { ...newCotizacionPar().insumo, valor: '200', numero: 'COT-002' } },
      { ...newCotizacionPar(), insumo: { ...newCotizacionPar().insumo, valor: '300', numero: 'COT-003' } },
    ]
    pares = applyAutoGanadoraByMinValor(pares)
    const gan = pares.find((p) => p.es_ganadora)
    assert.equal(gan.insumo.numero, 'COT-002')
    assert.deepEqual(ganadoraRuleErrors(pares), [])
  })

  it('ganadoraRuleErrors detecta ganadora más cara en No Previsto', () => {
    let pares = [
      {
        ...newCotizacionPar({ esGanadora: true }),
        insumo: { ...newCotizacionPar().insumo, valor: '100', numero: 'COT-001' },
        no_previsto: { ...newCotizacionPar().no_previsto, valor: '500', numero: 'COT-001' },
      },
      {
        ...newCotizacionPar(),
        insumo: { ...newCotizacionPar().insumo, valor: '200', numero: 'COT-002' },
        no_previsto: { ...newCotizacionPar().no_previsto, valor: '150', numero: 'COT-002' },
      },
    ]
    pares = applyAutoGanadoraByMinValor(pares)
    const errs = ganadoraRuleErrors(pares)
    assert.ok(errs.some((e) => /No Previsto/i.test(e)))
  })

  it('coherenciaErrors exige misma descripción/unidad/rendimiento', () => {
    const pares = buildParFromCapture({
      razon_social: 'A', nit: '1', descripcion: 'Geo 2400', unidad: 'M2', rendimiento: '1', costo_base: '10',
    }, [])
    const draftBad = { descripcion: 'Geo 2500', unidad: 'M2', rendimiento: '1' }
    const errs = coherenciaErrors(pares, draftBad)
    assert.ok(errs.some((e) => /descripción/i.test(e)))
  })

  it('validateCaptureForEnviar lista faltantes', () => {
    const r = validateCaptureForEnviar({ razon_social: '', nit: '', descripcion: '', unidad: '', costo_base: '' }, [])
    assert.ok(r.faltantes.length >= 3)
  })

  it('validateGuardarInsumo exige filas y PDF', () => {
    const form = {
      descripcion: 'X',
      unidad: 'UND',
      costo_base: '1',
      requiere_cotizacion: true,
      cotizaciones_detalle: buildParFromCapture({
        razon_social: 'A', nit: '1', descripcion: 'X', unidad: 'UND', rendimiento: '', costo_base: '10',
      }, []),
    }
    const r = validateGuardarInsumo(form, { minCotizaciones: 1 })
    assert.ok(r.faltantes.some((f) => /PDF/i.test(f)))
  })

  it('buildParFromCapture + payload + sync', () => {
    const pares = buildParFromCapture({
      razon_social: 'Acme',
      nit: '900',
      descripcion: 'Geotextil',
      unidad: 'M2',
      rendimiento: '1',
      costo_base: '1500',
      valor_no_previsto: '1800',
      cotizacion_fecha: '2026-01-15',
      cotizacion_vigencia: '30 días',
      cotizacion_fecha_np: '2026-01-20',
      cotizacion_vigencia_np: '45 días',
    }, [], {
      impuestoEtiqueta: 'IVA 19%',
      impuestoEtiquetaNp: 'AIU',
    })
    assert.equal(pares.length, 1)
    assert.equal(pares[0].es_ganadora, true)
    assert.equal(pares[0].no_previsto.valor, '1800')
    assert.equal(pares[0].insumo.fecha, '2026-01-15')
    assert.equal(pares[0].no_previsto.fecha, '2026-01-20')
    assert.equal(pares[0].insumo.impuesto_etiqueta, 'IVA 19%')
    assert.equal(pares[0].no_previsto.impuesto_etiqueta, 'AIU')
    const legacy = syncLegacyFromGanadora(pares)
    assert.equal(legacy.cotizacion_numero, 'COT-001')
    const payload = cotizacionesPayloadForSave(pares)
    assert.equal(payload.length, 2)
  })

  it('collectPdfFilesFromPares separa ganadora y soportes', () => {
    const a = new File(['x'], 'gan.pdf', { type: 'application/pdf' })
    const b = new File(['y'], 'sop.pdf', { type: 'application/pdf' })
    let pares = [
      { ...newCotizacionPar(), insumo: { ...newCotizacionPar().insumo, valor: '100', pdf: a } },
      { ...newCotizacionPar(), insumo: { ...newCotizacionPar().insumo, valor: '200', pdf: b } },
    ]
    pares = applyAutoGanadoraByMinValor(pares)
    const { ganadora, soportes } = collectPdfFilesFromPares(pares)
    assert.equal(ganadora.name, 'gan.pdf')
    assert.equal(soportes[0].name, 'sop.pdf')
  })


  it('applyPdfReplace archiva previo y deja vigente el nuevo', () => {
    const lado0 = { pdf_nombre: 'a.pdf', pdf: null, pdf_historial: [] }
    const f = new File(['x'], 'b.pdf', { type: 'application/pdf' })
    const next = applyPdfReplace(lado0, f)
    assert.equal(next.pdf_nombre, 'b.pdf')
    assert.equal(next.pdf.name, 'b.pdf')
    assert.equal(next.pdf_historial.length, 1)
    assert.equal(next.pdf_historial[0].nombre, 'a.pdf')
  })

  it('detalleToPares y ganadoraDesdeInsumoRow', () => {
    const fromDetalle = ganadoraDesdeInsumoRow({
      cotizaciones_detalle: [
        { pair_id: 'p1', tipo: 'insumo', es_ganadora: true, numero: 'A', valor: 10 },
        { pair_id: 'p1', tipo: 'no_previsto', numero: 'NP-1', valor: 20 },
      ],
    })
    assert.equal(fromDetalle.numero, 'A')
    assert.equal(detalleToPares([
      { pair_id: 'p1', tipo: 'insumo', es_ganadora: true, numero: 'G' },
      { pair_id: 'p1', tipo: 'no_previsto', numero: 'NP' },
    ]).length, 1)
  })
})
