import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyAutoGanadoraByMinValor,
  applyCaptureToPar,
  buildParFromCapture,
  coherenciaErrors,
  collectPdfFilesFromPares,
  cotizacionesPayloadForSave,
  detalleToPares,
  ganadoraRuleErrors,
  ganadoraDesdeInsumoRow,
  newCotizacionPar,
  nextCotizacionNumero,
  sanitizeRendimientoInput,
  seedCotizacionPares,
  syncLegacyFromGanadora,
  toUpperTrim,
  validateCaptureForEnviar,
  validateGuardarInsumo,
  applyPdfReplace,
  fileFromDataTransfer,
} from './catalogoInsumosCotizaciones.js'

const baseCapture = {
  razon_social: 'A',
  nit: '1',
  descripcion: 'Geo',
  unidad: 'M2',
  rendimiento: '1',
  costo_base: '100',
  cotizacion_numero: 'PV-100',
  cotizacion_numero_np: 'PV-100-NP',
}

describe('catalogoInsumosCotizaciones flujo enviar', () => {
  it('nextCotizacionNumero sigue disponible para legado', () => {
    assert.equal(nextCotizacionNumero([]), 'COT-001')
  })

  it('buildParFromCapture usa números manuales y no copia valor NP', () => {
    const pares = seedCotizacionPares({ minPares: 0 })
    const withOne = buildParFromCapture({ ...baseCapture }, pares)
    assert.equal(withOne[0].insumo.numero, 'PV-100')
    assert.equal(withOne[0].no_previsto.numero, 'PV-100-NP')
    assert.equal(withOne[0].no_previsto.valor, '')
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
      ...baseCapture,
      descripcion: 'Geo 2400',
      costo_base: '10',
    }, [])
    const draftBad = { descripcion: 'Geo 2500', unidad: 'M2', rendimiento: '1' }
    const errs = coherenciaErrors(pares, draftBad)
    assert.ok(errs.some((e) => /descripción/i.test(e)))
  })

  it('validateCaptureForEnviar exige Nº Insumo; NP solo si el panel tiene datos', () => {
    const soloInsumo = validateCaptureForEnviar({
      razon_social: 'A',
      nit: '1',
      descripcion: 'X',
      unidad: 'UND',
      costo_base: '10',
      cotizacion_numero: '',
    }, [])
    assert.ok(soloInsumo.faltantes.some((f) => /Nº de cotización \(Insumo\)/i.test(f)))
    assert.ok(!soloInsumo.faltantes.some((f) => /No Previsto/i.test(f)))

    const conNp = validateCaptureForEnviar({
      razon_social: 'A',
      nit: '1',
      descripcion: 'X',
      unidad: 'UND',
      costo_base: '10',
      cotizacion_numero: 'A-1',
      valor_no_previsto: '12',
      cotizacion_numero_np: '',
    }, [])
    assert.ok(conNp.faltantes.some((f) => /Nº de cotización \(No Previsto\)/i.test(f)))

    const ok = validateCaptureForEnviar({
      razon_social: 'A',
      nit: '1',
      descripcion: 'X',
      unidad: 'UND',
      costo_base: '10',
      cotizacion_numero: 'A-1',
    }, [])
    assert.deepEqual(ok.faltantes, [])
  })

  it('toUpperTrim y sanitizeRendimientoInput', () => {
    assert.equal(toUpperTrim('  abc-1 '), 'ABC-1')
    assert.equal(sanitizeRendimientoInput('12.5m'), '12.5')
    assert.equal(sanitizeRendimientoInput('1,25'), '1.25')
    assert.equal(sanitizeRendimientoInput('ab'), '')
  })

  it('buildParFromCapture guarda descripción y números en mayúsculas; NP vacío sin copiar', () => {
    const pares = buildParFromCapture({
      ...baseCapture,
      descripcion: 'geotextil',
      cotizacion_numero: 'pv-100',
      cotizacion_numero_np: '',
      valor_no_previsto: '',
    }, [])
    assert.equal(pares[0].coherencia.descripcion, 'GEOTEXTIL')
    assert.equal(pares[0].insumo.numero, 'PV-100')
    assert.equal(pares[0].no_previsto.numero, '')
    assert.equal(pares[0].no_previsto.valor, '')
  })

  it('validateGuardarInsumo exige filas y PDF', () => {
    const form = {
      descripcion: 'X',
      unidad: 'UND',
      costo_base: '1',
      requiere_cotizacion: true,
      cotizaciones_detalle: buildParFromCapture({
        ...baseCapture,
        descripcion: 'X',
        unidad: 'UND',
        rendimiento: '',
        costo_base: '10',
      }, []),
    }
    const r = validateGuardarInsumo(form, { minCotizaciones: 1 })
    assert.ok(r.faltantes.some((f) => /PDF/i.test(f)))
  })

  it('buildParFromCapture + applyCaptureToPar + payload + sync', () => {
    const pares = buildParFromCapture({
      razon_social: 'Acme',
      nit: '900',
      descripcion: 'Geotextil',
      unidad: 'M2',
      rendimiento: '1',
      costo_base: '1500',
      valor_no_previsto: '1800',
      cotizacion_numero: 'ACME-01',
      cotizacion_numero_np: 'ACME-01-NP',
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
    const updated = applyCaptureToPar(pares[0], {
      razon_social: 'Acme',
      nit: '900',
      costo_base: '1400',
      valor_no_previsto: '',
      cotizacion_numero: 'ACME-01-B',
      cotizacion_numero_np: 'ACME-NP-B',
      cotizacion_fecha: '2026-02-01',
      cotizacion_fecha_np: '',
    }, { impuestoEtiqueta: 'IVA 19%', impuestoEtiquetaNp: 'AIU' })
    assert.equal(updated.insumo.valor, '1400')
    assert.equal(updated.no_previsto.valor, '')
    assert.equal(updated.insumo.numero, 'ACME-01-B')
    assert.equal(updated.no_previsto.numero, 'ACME-NP-B')
    const legacy = syncLegacyFromGanadora(pares)
    assert.equal(legacy.cotizacion_numero, 'ACME-01')
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
    assert.equal(ganadora?.name, 'gan.pdf')
    assert.equal(soportes.length, 1)
    assert.equal(soportes[0].name, 'sop.pdf')
  })

  it('applyPdfReplace archiva previo y deja vigente el nuevo', () => {
    const prev = new File(['a'], 'old.pdf', { type: 'application/pdf' })
    const next = new File(['b'], 'new.pdf', { type: 'application/pdf' })
    const lado = applyPdfReplace({ pdf: prev, pdf_nombre: 'old.pdf', pdf_historial: [] }, next)
    assert.equal(lado.pdf_nombre, 'new.pdf')
    assert.equal(lado.pdf_historial.length, 1)
    assert.equal(lado.pdf_historial[0].nombre, 'old.pdf')
  })

  it('detalleToPares y ganadoraDesdeInsumoRow', () => {
    const flat = [
      { id: 'a-insumo', pair_id: 'a', tipo: 'insumo', es_ganadora: true, valor: 10, numero: 'N1' },
      { id: 'a-np', pair_id: 'a', tipo: 'no_previsto', valor: 12, numero: 'N1-NP' },
    ]
    const pares = detalleToPares(flat)
    assert.equal(pares.length, 1)
    const gan = ganadoraDesdeInsumoRow({ cotizaciones_detalle: flat, costo: 10 })
    assert.equal(gan?.numero, 'N1')
  })

  it('fileFromDataTransfer toma el primer archivo', () => {
    const f = new File(['z'], 'x.pdf', { type: 'application/pdf' })
    const dt = { files: [f], items: [] }
    assert.equal(fileFromDataTransfer(dt)?.name, 'x.pdf')
  })
})
