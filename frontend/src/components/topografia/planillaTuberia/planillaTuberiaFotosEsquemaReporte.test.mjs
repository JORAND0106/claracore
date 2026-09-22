/**
 * Fotos (cámara/archivo/galería) + esquema obligatorio en Crear reporte.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaFotosEsquemaReporte.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeMapContext,
  ensureEsquemaTramoLayers,
  ESQUEMA_MAPA_TRAMO_SOURCE,
} from '../../esquema/esquemaMapaPkLayers.js'
import { validarEvidenciasFotograficas } from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const evidSrc = readFileSync(join(dir, 'PlanillaTuberiaEvidenciaBtn.jsx'), 'utf8')
const modalSrc = readFileSync(join(dir, 'PlanillaTuberiaCrearReporteModal.jsx'), 'utf8')
const esquemaSrc = readFileSync(join(dir, '../../esquema/EsquemaEditorModal.jsx'), 'utf8')

describe('Crear reporte — fotos + esquema tramo', () => {
  it('evidencia ofrece cámara, archivo y galería SICOE', () => {
    assert.match(evidSrc, /PptoSicoeGaleriaPicker/)
    assert.match(evidSrc, /📷 Cámara/)
    assert.match(evidSrc, /📁 Archivo/)
    assert.match(evidSrc, /🖼 Galería/)
    assert.match(evidSrc, /capture="environment"/)
    assert.match(evidSrc, /data-evidencia-fuente-menu/)
    assert.match(formSrc, /contratoId=\{contratoId\}/)
    assert.match(formSrc, /theme=\{ui\.t\}/)
  })

  it('Crear reporte valida fotos faltantes antes de abrir el modal', () => {
    assert.match(formSrc, /validarEvidenciasFotograficas\(calculoVista, evidencias/)
    assert.match(formSrc, /No se puede crear el reporte: faltan fotos/)
    const calc = {
      netos: [{ codigo: 'EXC', nombre: 'Excavación', neto: 10, unidad: 'm³' }],
      descuentos: [{ codigo: 'A1', nombre: 'Area 1', cantidad: 1, unidad: 'm³' }],
    }
    const sin = validarEvidenciasFotograficas(calc, {})
    assert.equal(sin.ok, false)
    assert.equal(sin.faltantes.length, 2)
  })

  it('modal exige esquema del tramo guardado', () => {
    assert.match(modalSrc, /EsquemaEditorModal/)
    assert.match(modalSrc, /data-esquema-tramo-obligatorio/)
    assert.match(modalSrc, /esquemaListo/)
    assert.match(modalSrc, /Genere y guarde el esquema del tramo/)
    assert.match(modalSrc, /!esquemaListo/)
    assert.match(modalSrc, /seedTramo/)
    assert.match(modalSrc, /autoActivateMap/)
    assert.match(modalSrc, /tramoInicio/)
    assert.match(modalSrc, /tramoFin/)
  })

  it('esquema acepta seedTramo + autoActivateMap y capas de mapa Inicio/Fin', () => {
    assert.match(esquemaSrc, /seedTramo/)
    assert.match(esquemaSrc, /autoActivateMap/)
    assert.match(esquemaSrc, /ensureEsquemaTramoLayers/)
    assert.match(esquemaSrc, /nodeNum: r\.num/)
    assert.match(esquemaSrc, /type: 'flecha'/)
    const ctx = normalizeMapContext({
      tramoInicio: { lat: 4.6, lng: -74.1, label: 'Inicio' },
      tramoFin: { lat: 4.61, lng: -74.09, label: 'Fin' },
    })
    assert.equal(ctx.hasTramo, true)
    assert.equal(ctx.tramoInicio.label, 'Inicio')
    assert.equal(ctx.tramoFin.label, 'Fin')
    assert.equal(ESQUEMA_MAPA_TRAMO_SOURCE, 'esquema-tramo-planilla')
    // ensureEsquemaTramoLayers no debe lanzar con map mock mínimo
    const layers = {}
    const map = {
      getSource: () => null,
      addSource: (id) => { layers[id] = true },
      getLayer: () => null,
      addLayer: (spec) => { layers[spec.id] = true },
    }
    ensureEsquemaTramoLayers(map, ctx)
    assert.equal(layers[ESQUEMA_MAPA_TRAMO_SOURCE], true)
  })
})
