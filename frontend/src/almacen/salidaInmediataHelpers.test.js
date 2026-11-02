import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildPrefillSalidaInmediata,
  consolidarPrefillInsumos,
} from './salidaInmediataHelpers.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('salidaInmediataHelpers', () => {
  it('arma prefill con cantidades de la entrada y receptor por defecto', () => {
    const prefill = buildPrefillSalidaInmediata({
      id: 41,
      codigo: 'Ent-9-00041',
      created_by: 7,
      usuario_nombre: 'Ana Pérez',
      pk_id: 'PK-12',
      tramo: 'T1',
      items: [
        { id: 100, cantidad_recibida: 2, material_descripcion: 'CC-1', unidad: 'UND' },
        { id: 101, cantidad_recibida: 1, material_descripcion: 'CC-1', unidad: 'UND' },
      ],
    })
    assert.equal(prefill.entradaId, 41)
    assert.equal(prefill.codigoEntrada, 'Ent-9-00041')
    assert.equal(prefill.items.length, 2)
    assert.equal(prefill.items[0].entrada_item_id, 100)
    assert.equal(prefill.items[0].cantidad_salida, 2)
    assert.equal(prefill.receptor.id, 7)
    assert.match(prefill.receptor.label, /Ana/)
    assert.equal(prefill.pkId, 'PK-12')
  })

  it('consolida insumos repetidos solo en presentación', () => {
    const rows = consolidarPrefillInsumos([
      { material_descripcion: 'CC-1', unidad: 'UND', cantidad_salida: 2 },
      { material_descripcion: 'CC-1', unidad: 'UND', cantidad_salida: 1 },
      { material_descripcion: 'Arena', unidad: 'm³', cantidad_salida: 5 },
    ])
    assert.equal(rows.length, 2)
    const cc = rows.find((r) => r.material_descripcion === 'CC-1')
    assert.equal(cc.cantidad_salida, 3)
  })
})

describe('cableado UI salida inmediata + soportes en fila', () => {
  it('tablet: Remisión/Descargue lado a lado y pregunta Sí/No', () => {
    const wiz = readFileSync(join(dir, 'EntradaRegistroTablet.jsx'), 'utf8')
    const picker = readFileSync(join(dir, 'EntradaSoportePicker.jsx'), 'utf8')
    assert.match(wiz, /entrada-tablet-soportes-fila/)
    assert.match(wiz, /gridTemplateColumns: 'repeat\(auto-fit, minmax\(240px, 1fr\)\)'/)
    assert.match(wiz, /entrada-tablet-usa-de-una-vez/)
    assert.match(wiz, /usaDeUnaVez/)
    assert.match(wiz, /salida_inmediata_pendiente/)
    assert.match(wiz, /buildPrefillSalidaInmediata/)
    assert.match(wiz, /prefillInmediata/)
    assert.match(wiz, /entrada-tablet-numero-remision/)
    assert.match(picker, /children/)
    assert.match(picker, /entrada-soporte-\$\{kind\}-extra/)
  })

  it('panel y popup: prefill, pendiente y confirmar multi', () => {
    const panel = readFileSync(join(dir, 'EntradasPanel.jsx'), 'utf8')
    const popup = readFileSync(join(dir, 'SalioMaterialPopup.jsx'), 'utf8')
    const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
    assert.match(panel, /prefillInmediata/)
    assert.match(panel, /entrada-salida-pendiente-btn/)
    assert.match(panel, /completarSalidaInmediata/)
    assert.match(popup, /REGISTRAR_INMEDIATA/)
    assert.match(popup, /guardarInmediata/)
    assert.match(popup, /salio-inmediata-guardar/)
    assert.match(popup, /Dejar pendiente/)
    assert.match(api, /salida-inmediata\/completar/)
  })
})
