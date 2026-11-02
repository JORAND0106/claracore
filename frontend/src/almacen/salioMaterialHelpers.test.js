import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  consolidarMaterialesDisponibles,
  filterMaterialCards,
  motivosSalidaPorRevisarPreview,
  pickLineaPreferida,
} from './salioMaterialHelpers.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('salioMaterialHelpers', () => {
  it('consolida materiales con saldo y no incluye sin disponible', () => {
    const cards = consolidarMaterialesDisponibles([
      { entrada_item_id: 1, material_descripcion: 'Arena', unidad: 'm³', cantidad_disponible: 10, pk_id: 'A', numero_oc: 1 },
      { entrada_item_id: 2, material_descripcion: 'Arena', unidad: 'm³', cantidad_disponible: 5, pk_id: 'B', numero_oc: 1 },
      { entrada_item_id: 3, material_descripcion: 'Cemento', unidad: 'kg', cantidad_disponible: 0, pk_id: 'A' },
      { entrada_item_id: 4, material_descripcion: 'Grava', unidad: 'm³', cantidad_disponible: 2, pk_id: 'C', numero_oc: 9 },
    ])
    assert.equal(cards.length, 2)
    const arena = cards.find((c) => c.material_descripcion === 'Arena')
    assert.ok(arena)
    assert.equal(arena.cantidad_disponible_total, 15)
    assert.equal(arena.lineas.length, 2)
    assert.ok(cards.every((c) => c.material_descripcion !== 'Cemento'))
  })

  it('filtra por línea específica en búsqueda', () => {
    const cards = consolidarMaterialesDisponibles([
      { entrada_item_id: 1, material_descripcion: 'Arena lavada', unidad: 'm³', cantidad_disponible: 10, pk_id: '120', numero_entrada: 3 },
      { entrada_item_id: 2, material_descripcion: 'Cemento gris', unidad: 'kg', cantidad_disponible: 8, pk_id: '999', numero_entrada: 7 },
    ])
    const hit = filterMaterialCards(cards, 'cemento')
    assert.equal(hit.length, 1)
    assert.equal(hit[0].material_descripcion, 'Cemento gris')
    const byPk = filterMaterialCards(cards, '120')
    assert.equal(byPk.length, 1)
    assert.equal(byPk[0].matchMode, 'all')
  })

  it('pickLineaPreferida elige mayor saldo', () => {
    const pref = pickLineaPreferida([
      { entrada_item_id: 1, cantidad_disponible: 2 },
      { entrada_item_id: 2, cantidad_disponible: 9 },
    ])
    assert.equal(pref.entrada_item_id, 2)
  })

  it('motivos por revisar sector y receptor', () => {
    assert.deepEqual(
      motivosSalidaPorRevisarPreview({ sinSector: true, sinReceptor: true }),
      ['Sin sector', 'Sin receptor'],
    )
    assert.deepEqual(
      motivosSalidaPorRevisarPreview({ sinSector: false, sinReceptor: false }),
      [],
    )
  })
})

describe('cableado Salió material popup', () => {
  it('popup, panel y main redirigen Tab Salidas', () => {
    const popup = readFileSync(join(dir, 'SalioMaterialPopup.jsx'), 'utf8')
    const tablet = readFileSync(join(dir, 'EntradaRegistroTablet.jsx'), 'utf8')
    const panel = readFileSync(join(dir, 'EntradasPanel.jsx'), 'utf8')
    const main = readFileSync(join(dir, 'AlmacenMain.jsx'), 'utf8')
    assert.match(popup, /salio-material-popup/)
    assert.match(popup, /salio-tab-historial/)
    assert.match(popup, /listEntradasDisponibles/)
    assert.match(popup, /AlmacenPkMapaSelector/)
    assert.match(popup, /ReceptorObraSelector/)
    assert.match(popup, /printSalidaPdf/)
    assert.match(tablet, /onAbrirSalioMaterial/)
    assert.match(tablet, /salio-material-por-revisar-badge/)
    assert.match(panel, /SalioMaterialPopup/)
    assert.match(main, /tab === 'salidas'/)
    assert.doesNotMatch(main, /id: 'salidas'/)
    assert.doesNotMatch(main, /tab === 'salidas' && puedeVerEntsal && \(\s*<SalidasPanel/)
  })
})
