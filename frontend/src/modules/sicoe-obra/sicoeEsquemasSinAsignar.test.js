/**
 * C-OUT-14 / C-OUT-18: Guardar independiente de asignación («Sin asignar»).
 */
import 'fake-indexeddb/auto'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  mergeEsquemasLista,
  sinAsignarToListRows,
  upsertEsquemaSinAsignar,
  listarEsquemasSinAsignar,
  removeEsquemaSinAsignar,
} from './sicoeEsquemasSinAsignar.js'
import { buildEsquemaHistorialEntrada } from './sicoeEsquemasReporte.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(__dirname, '../..')

function read(rel) {
  return readFileSync(join(srcRoot, rel), 'utf8')
}

describe('sicoeEsquemasSinAsignar · merge lista', () => {
  it('une asignados + sin asignar sin duplicar y etiqueta sinAsignar', () => {
    const asignados = [{
      esquema_id: 'esq-placa',
      numero: 161,
      nombre: 'Placa base',
      url: 'https://cdn/placa.png',
      registros: [{ id: 1, numero_registro: 440 }],
    }]
    const sin = [{
      esquema_id: 'esq-nuevo',
      numero: 174,
      nombre: 'Nuevo muro',
      url: 'https://cdn/nuevo.png',
      scene: { v: 1, solids: [{ id: 's1', h: 0.63 }] },
      creado_en: '2026-01-01T00:00:00.000Z',
      updatedAt: 1,
      entrada: {},
    }]
    const list = mergeEsquemasLista(asignados, sin)
    assert.equal(list.length, 2)
    const nuevo = list.find((r) => r.esquema_id === 'esq-nuevo')
    assert.ok(nuevo)
    assert.equal(nuevo.sinAsignar, true)
    assert.deepEqual(nuevo.registros, [])
    assert.equal(nuevo.scene?.solids?.[0]?.h, 0.63)
    assert.equal(list.find((r) => r.esquema_id === 'esq-placa').sinAsignar, false)
  })

  it('si ya está asignado, no duplica la fila Sin asignar', () => {
    const asignados = [{
      esquema_id: 'esq-placa',
      numero: 161,
      nombre: 'Placa',
      url: 'u',
      registros: [{ id: 1, numero_registro: 440 }],
    }]
    const sin = [{
      esquema_id: 'esq-placa',
      numero: 161,
      nombre: 'Placa',
      url: 'u',
      updatedAt: 1,
      entrada: {},
    }]
    const list = mergeEsquemasLista(asignados, sin)
    assert.equal(list.length, 1)
    assert.equal(list[0].sinAsignar, false)
  })

  it('sinAsignarToListRows marca registros vacíos', () => {
    const rows = sinAsignarToListRows([{
      esquema_id: 'a', numero: 1, nombre: 'X', url: 'u', scene: { v: 1 },
    }])
    assert.equal(rows[0].sinAsignar, true)
    assert.deepEqual(rows[0].registros, [])
    assert.equal(rows[0].scene.v, 1)
  })
})

describe('sicoeEsquemasSinAsignar · persistencia IndexedDB', () => {
  const contratoId = 'c-test-sin-asig'
  const reporteId = '57'
  const esquemaId = 'esq-persist-reopen'

  before(async () => {
    await removeEsquemaSinAsignar({ contratoId, reporteId, esquemaId })
  })
  after(async () => {
    await removeEsquemaSinAsignar({ contratoId, reporteId, esquemaId })
  })

  it('guardar → listar → reabrir conserva escena (contenido)', async () => {
    const scene = {
      v: 2,
      solids: [{ id: 'sol-a', height: 0.63 }, { id: 'sol-b', height: 1.2 }],
      objects: [{ id: 'o1', type: 'line' }],
      calc: { total: 2.27 },
    }
    const entrada = buildEsquemaHistorialEntrada({
      url: 'https://cdn/reopen.png',
      numero: 200,
      nombre: 'Reabrir contenido',
      esquemaId,
      scene,
      reporteId,
    })
    const up = await upsertEsquemaSinAsignar({ contratoId, reporteId, entrada })
    assert.equal(up.ok, true)

    const listed = await listarEsquemasSinAsignar({ contratoId, reporteId })
    const hit = listed.find((r) => r.esquema_id === esquemaId)
    assert.ok(hit, 'aparece en lista Sin asignar')
    assert.equal(hit.url, entrada.url)
    assert.equal(hit.scene?.solids?.length, 2)
    assert.equal(hit.scene.solids[1].height, 1.2)
    assert.equal(hit.scene.calc.total, 2.27)

    const merged = mergeEsquemasLista([], listed)
    const row = merged.find((r) => r.esquema_id === esquemaId)
    assert.equal(row.sinAsignar, true)
    assert.equal(row.scene.solids[0].height, 0.63)

    await removeEsquemaSinAsignar({ contratoId, reporteId, esquemaId })
    const afterRm = await listarEsquemasSinAsignar({ contratoId, reporteId })
    assert.ok(!afterRm.some((r) => r.esquema_id === esquemaId))
  })
})

describe('sicoeEsquemasSinAsignar · cableado modal / editor', () => {
  it('Guardar persiste antes de asignar; cancelar no pierde; keepDraft', () => {
    const modal = read('modules/sicoe-obra/SicoeEsquemasReporteModal.jsx')
    assert.match(modal, /upsertEsquemaSinAsignar/)
    assert.match(modal, /removeEsquemaSinAsignar/)
    assert.match(modal, /mergeEsquemasLista/)
    assert.match(modal, /Sin asignar/)
    assert.match(modal, /keepDraft:\s*true/)
    assert.match(modal, /keepDraft:\s*false/)
    assert.match(modal, /cancelarAsignacion/)
    // Persistencia en onSaveEditor ANTES del popup de asignación
    assert.match(modal, /persistir YA \(Sin asignar\)|upsertEsquemaSinAsignar[\s\S]*setAssignOpen\(true\)/)
    assert.match(modal, /presentEsquemaExportPopup/)
  })

  it('editor respeta keepDraft y muestra Sin guardar / reintento', () => {
    const modal = read('components/esquema/EsquemaEditorModal.jsx')
    assert.match(modal, /saveResult && saveResult\.keepDraft|keepDraft = !!\(saveResult/)
    assert.match(modal, /'unsaved'/)
    assert.match(modal, /Sin guardar/)
    assert.match(modal, /endStatus/)
    // No borrar borrador si keepDraft
    assert.match(modal, /if \(!keepDraft\)/)
    assert.match(modal, /esquemaDraftClear/)
  })

  it('contrato documenta Guardar independiente + Sin asignar + indicador', () => {
    const md = read('components/esquema/CONTRATO_ESQUEMA.md')
    assert.match(md, /Sin asignar/)
    assert.match(md, /independiente de la asignación|nunca depende de la asignación/i)
    assert.match(md, /Sin guardar/)
    assert.match(md, /sicoeEsquemasSinAsignar/)
  })
})
