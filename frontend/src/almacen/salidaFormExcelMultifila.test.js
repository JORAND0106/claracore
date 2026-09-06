/**
 * Popup Salidas — formato Excel multi-fila.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Salidas Excel multi-fila', () => {
  it('modal más ancho y subtítulo multi-línea', () => {
    const src = readFileSync(join(__dirname, 'SalidaFormModal.jsx'), 'utf8')
    assert.match(src, /min\(1180px/)
    assert.match(src, /varias líneas en un mismo registro/)
  })

  it('formulario Excel con encabezado, mapa satélite y grilla de líneas', () => {
    const src = readFileSync(join(__dirname, 'SalidaForm.jsx'), 'utf8')
    assert.match(src, /cc-almacen-salida-excel/)
    assert.match(src, /variant="excel"/)
    assert.match(src, /initialBasemap="satelite"/)
    assert.match(src, /showBasemapToggle/)
    assert.match(src, /Agregar fila/)
    assert.match(src, /salida-add-linea/)
    assert.match(src, /items/)
    assert.match(src, /createSalida\(body\)/)
    assert.match(src, /lineas/)
  })

  it('conserva funcionalidades clave de salida', () => {
    const src = readFileSync(join(__dirname, 'SalidaForm.jsx'), 'utf8')
    for (const needle of [
      'ReceptorObraSelector',
      'AlmacenPkMapaSelector',
      'UbicacionSolicitudFields',
      'alerta_proximidad_consumo',
      'mensajeExcesoCantidadDespachar',
      'observaciones',
      'Quién despacha',
      'validateAbscisaRango',
      'datetimeLocalColombiaToIsoUtc',
    ]) {
      assert.match(src, new RegExp(needle))
    }
  })

  it('no permite repetir la misma entrada en otra fila', () => {
    const src = readFileSync(join(__dirname, 'SalidaForm.jsx'), 'utf8')
    assert.match(src, /entradasUsadas/)
    assert.match(src, /disabled=\{used\}/)
    assert.match(src, /\(en otra fila\)/)
  })

  it('panel refresca PDF también en lote multi-línea', () => {
    const src = readFileSync(join(__dirname, 'SalidasPanel.jsx'), 'utf8')
    assert.match(src, /salidasLote/)
    assert.match(src, /pdfPendiente/)
  })
})
