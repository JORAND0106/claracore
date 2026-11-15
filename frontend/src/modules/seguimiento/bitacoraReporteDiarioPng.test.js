/**
 * Tests — PNG descargable Bitácora (colaboradores + eventos).
 * node --test src/modules/seguimiento/bitacoraReporteDiarioPng.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildBitacoraPngPayload,
  buildEventosPngRows,
  nombreArchivoBitacoraPng,
  optsCapturaBitacoraPng,
} from './bitacoraReporteDiarioPng.js'

const dir = dirname(fileURLToPath(import.meta.url))
const editorSrc = readFileSync(join(dir, 'BitacoraEntradaEditor.jsx'), 'utf8')
const captureSrc = readFileSync(join(dir, 'BitacoraReporteDiarioPngCapture.jsx'), 'utf8')

describe('bitacoraReporteDiarioPng — descarga colaboradores + eventos', () => {
  it('payload: solo personal (tramo×empresa) y eventos; sin maquinaria/materiales', () => {
    const payload = buildBitacoraPngPayload({
      fecha: '2026-11-12',
      contratoMeta: { numero: 'CTO-1', contratista: 'Consorcio X' },
      asistencia: [
        { nombre: 'Ana', cargo: 'Ayudante', subcontratista_nombre: 'E1', tramo: 'Tramo 1', estado: 'activo' },
        { nombre: 'Beto', cargo: 'Oficial', subcontratista_nombre: 'E2', tramo: 'Tramo 1', estado: 'activo' },
        { nombre: 'Carla', cargo: 'Oficial', subcontratista_nombre: 'E1', tramo: 'Tramo 2', estado: 'activo' },
      ],
      eventos: [
        {
          evento_tipo: 'visita_terceros',
          dirigido_a: 'Interventoría',
          cuerpo_html: '<p>Recorrido OK</p>',
          evento_detalle: {
            entidad: 'ICCU',
            motivo: 'Seguimiento',
            visitantes_lista: [{ nombre: 'Laura' }],
          },
        },
        {
          evento_tipo: 'novedades',
          dirigido_a: '',
          cuerpo_html: '<p>Nota del día</p>',
          evento_detalle: {},
        },
      ],
    })

    assert.equal(payload.hasData, true)
    assert.equal(payload.fechaFmt, '12/11/2026')
    assert.equal(payload.numero, 'CTO-1')
    assert.equal(payload.personal.hasData, true)
    assert.equal(payload.personal.grandTotal, 3)
    assert.equal(payload.personal.tramos.length, 2)
    assert.equal(payload.personal.empresas.length, 2)
    assert.equal(payload.eventosRows.length, 2)
    assert.match(payload.eventosRows[0].tipo, /Recorrido|obra/i)
    assert.match(payload.eventosRows[0].resumen, /Laura|ICCU|Recorrido/)
    assert.equal(payload.eventosRows[1].dirigido_a, '—')
    // No campos de maquinaria/firmas en el payload
    assert.equal(payload.usos, undefined)
    assert.equal(payload.firmas, undefined)
    assert.equal(payload.materiales, undefined)
  })

  it('eventos vacíos y personal vacío → hasData false', () => {
    const vacio = buildBitacoraPngPayload({ asistencia: [], eventos: [] })
    assert.equal(vacio.hasData, false)
    assert.equal(vacio.personal.hasData, false)
    assert.equal(vacio.eventosRows.length, 0)
    assert.equal(buildEventosPngRows(null).length, 0)
  })

  it('nombre de archivo y opts de captura con dimensiones reales', () => {
    assert.equal(nombreArchivoBitacoraPng('2026-11-12'), 'bitacora_reporte_2026-11-12.png')
    const opts = optsCapturaBitacoraPng({ scrollWidth: 920, scrollHeight: 1400, offsetWidth: 920, offsetHeight: 1400 })
    assert.equal(opts.backgroundColor, '#ffffff')
    assert.equal(opts.width, 920)
    assert.equal(opts.height, 1400)
    assert.ok(opts.pixelRatio >= 2)
    assert.equal(opts.style.opacity, '1')
  })

  it('editor: descarga PNG (no portapapeles) + captura con withCapturePosition', () => {
    assert.match(editorSrc, /withCapturePosition/)
    assert.match(editorSrc, /optsCapturaBitacoraPng/)
    assert.match(editorSrc, /nombreArchivoBitacoraPng/)
    assert.match(editorSrc, /downloadInformePeriodicoBlob/)
    assert.match(editorSrc, /exportarPngDia/)
    assert.match(editorSrc, /Descargar PNG \(colaboradores y eventos\)/)
    assert.match(editorSrc, /pngAviso/)
    assert.match(editorSrc, /CcConfirmModal/)
    assert.match(editorSrc, /eventos=\{eventos\}/)
    assert.doesNotMatch(editorSrc, /navigator\.clipboard\.write/)
    // Props del capture: eventos + asistencia; sin usos/firmas/horario
    const captureBlock = editorSrc.match(
      /<BitacoraReporteDiarioPngCapture[\s\S]*?\/>/,
    )?.[0] || ''
    assert.match(captureBlock, /eventos=\{eventos\}/)
    assert.match(captureBlock, /asistencia=\{asistencia\}/)
    assert.doesNotMatch(captureBlock, /\busos=/)
    assert.doesNotMatch(captureBlock, /\bfirmas=/)
    assert.doesNotMatch(captureBlock, /\bhorario=/)
  })

  it('capture: solo bloques colaboradores y eventos; fondo sólido', () => {
    assert.match(captureSrc, /Colaboradores \(por tramo y empresa\)/)
    assert.match(captureSrc, /Eventos del día/)
    assert.match(captureSrc, /buildBitacoraPngPayload/)
    assert.match(captureSrc, /background: surface/)
    assert.doesNotMatch(captureSrc, /Maquinaria en uso/)
    assert.doesNotMatch(captureSrc, /Hrs extra/)
    assert.doesNotMatch(captureSrc, /Residente de obra/)
    // Parque off-screen del nodo fuente; la captura clona al viewport.
    assert.match(captureSrc, /left:\s*'-10000px'/)
    assert.match(captureSrc, /data-bitacora-png-capture/)
    const helpers = readFileSync(join(dir, 'bitacoraReporteDiarioPng.js'), 'utf8')
    assert.match(helpers, /cloneNode\(true\)/)
    assert.match(helpers, /data-bitacora-png-host/)
    assert.doesNotMatch(helpers, /zIndex:\s*'-1'/)
  })
})
