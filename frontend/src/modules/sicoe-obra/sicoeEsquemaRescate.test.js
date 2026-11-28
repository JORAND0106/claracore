/**
 * C-OUT-18 · rescate + no borrar + varios cálculos en escena/PNG.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  contarCalculosEscena,
  elegirMejorVersionEsquema,
  esquemaPuedeBorrarse,
  extraerCandidatosDesdeAuditoria,
  planificarRescateEsquema,
} from './sicoeEsquemaRescate.js'
import {
  aligerarEscenaParaHistorial,
  buildEsquemaHistorialEntrada,
  planificarAsignacionEsquema,
} from './sicoeEsquemasReporte.js'
import { planEsquemaExportSalida } from '../../components/esquema/esquemaExport.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(join(__dirname, rel), 'utf8')

describe('sicoeEsquemaRescate · no borrar + rescate', () => {
  it('esquemaPuedeBorrarse es siempre false', () => {
    assert.equal(esquemaPuedeBorrarse(), false)
  })

  it('elige versión con más cálculos sobre la más antigua', () => {
    const v1 = {
      url: 'https://cdn/v1.png',
      esquema_id: 'esq-1',
      numero: 200,
      creado_en: '2026-01-01T00:00:00Z',
      scene: {
        volumeCalcs: [{ id: 'c1', nombre: 'Todo', lines: [{ id: 'l1' }] }],
      },
      _rescateFuente: 'log_modificaciones',
    }
    const v2 = {
      url: 'https://cdn/v2.png',
      esquema_id: 'esq-1',
      numero: 200,
      creado_en: '2026-01-02T00:00:00Z',
      scene: {
        volumeCalcs: [
          { id: 'c1', nombre: 'Excavación', lines: [{ id: 'l1' }] },
          { id: 'c2', nombre: 'Solado', lines: [{ id: 'l2' }] },
          { id: 'c3', nombre: 'Concreto bases', lines: [{ id: 'l3' }] },
          { id: 'c4', nombre: 'Concreto elevaciones', lines: [{ id: 'l4' }] },
        ],
      },
      _rescateFuente: 'borrador',
    }
    assert.equal(contarCalculosEscena(v2), 4)
    const best = elegirMejorVersionEsquema([v1, v2])
    assert.equal(best.entrada.url, 'https://cdn/v2.png')
    assert.equal(best.nCalcs, 4)
    assert.match(best.razon, /4 cálculos/)
  })

  it('planificarRescate restaura y reasigna sin tocar cantidades', () => {
    const regs = [
      { id: 1, numero_registro: 10, reporte_id: 99, cantidad_total: 1.5, graficos_historial: [] },
      { id: 2, numero_registro: 11, reporte_id: 99, cantidad_total: 2.5, graficos_historial: [] },
    ]
    const audit = [
      {
        id: 1,
        numero_registro: 10,
        graficos_historial: [{
          url: 'https://cdn/rescate.png',
          numero: 301,
          esquema_id: 'esq-rescate',
          nombre: 'Estructura',
          origen: 'esquema',
          scene: {
            volumeCalcs: [
              { id: 'a', nombre: 'Excavación', lines: [{ id: '1' }] },
              { id: 'b', nombre: 'Solado', lines: [{ id: '2' }] },
            ],
            solids3d: [{ id: 's1', type: 'solid3d', cells: [{}] }],
          },
        }],
      },
      {
        id: 2,
        numero_registro: 11,
        graficos_historial: [{
          url: 'https://cdn/rescate.png',
          numero: 301,
          esquema_id: 'esq-rescate',
          origen: 'esquema',
          scene: { volumeCalcs: [{ id: 'a', lines: [{ id: '1' }] }] },
        }],
      },
    ]
    const candidatos = extraerCandidatosDesdeAuditoria(audit)
    const plan = planificarRescateEsquema({
      candidatos,
      registros: regs,
      reporteId: 99,
    })
    assert.equal(plan.ok, true)
    assert.equal(plan.nCalcs, 2)
    assert.equal(plan.entrada.url, 'https://cdn/rescate.png')
    assert.ok(plan.patches.length >= 1)
    for (const p of plan.patches) {
      assert.equal(p.body.cantidad_total, undefined)
      assert.ok(p.body.graficos_historial.some((g) => g.esquema_id === plan.entrada.esquema_id))
    }
  })

  it('desasignar todos → patches quitan historial; UI permite 0 en reasignar', () => {
    const entrada = buildEsquemaHistorialEntrada({
      url: 'https://cdn/x.png', numero: 1, nombre: 'X', esquemaId: 'esq-x',
      scene: { volumeCalcs: [{ id: 'c', lines: [{ id: 'l' }] }] },
    })
    const regs = [
      {
        id: 1, numero_registro: 1, reporte_id: 1, cantidad_total: 9,
        graficos_historial: [{ ...entrada }],
      },
    ]
    const { patches } = planificarAsignacionEsquema({
      registros: regs,
      entrada,
      idsDeseados: [],
    })
    assert.equal(patches.length, 1)
    assert.ok(!patches[0].body.graficos_historial.some((g) => g.esquema_id === 'esq-x'))

    const popup = read('SicoeEsquemaAsignarPopup.jsx')
    assert.match(popup, /allowEmpty|mode === 'reasignar'/)
    assert.match(popup, /Dejar sin asignar/)
    const modal = read('SicoeEsquemasReporteModal.jsx')
    assert.match(modal, /mode=\{assignMode === 'reasignar'/)
    assert.match(modal, /NUNCA borra el esquema|Desasignado de todos/)
  })

  it('aligerarEscena conserva volumeCalcs (varios) y solids3d', () => {
    const slim = aligerarEscenaParaHistorial({
      objects: [{ id: 1, type: 'rect', dataUri: 'data:image/png;base64,XX' }],
      solids3d: [{ id: 's1', type: 'solid3d', cells: [{ z: 1 }], src: 'data:image/png;base64,YY' }],
      volumeCalcs: [
        { id: 'c1', nombre: 'Excavación', lines: [{ id: 'l1', nombre: 'Exc' }] },
        { id: 'c2', nombre: 'Solado', lines: [{ id: 'l2', nombre: 'Sol' }] },
        { id: 'c3', nombre: 'Concreto bases', lines: [{ id: 'l3' }] },
        { id: 'c4', nombre: 'Concreto elevaciones', lines: [{ id: 'l4' }] },
      ],
    })
    assert.equal(slim.volumeCalcs.length, 4)
    assert.equal(slim.solids3d[0].id, 's1')
    assert.equal(slim.objects[0]._dataUriOmitted, true)
  })

  it('PNG plan: un cuadro de memoria por cálculo (no sumados)', () => {
    const snaps = [
      { nombre: 'Excavación', totalM3: 11.36, lines: [{ ok: true, volumeM3: 11.36 }], memoriaRows: [{ nombre: 'Exc', volumeM3: 11.36 }] },
      { nombre: 'Solado', totalM3: 0.5, lines: [{ ok: true, volumeM3: 0.5 }], memoriaRows: [{ nombre: 'Sol', volumeM3: 0.5 }] },
      { nombre: 'Concreto bases', totalM3: 2.1, lines: [{ ok: true, volumeM3: 2.1 }], memoriaRows: [{ nombre: 'Base', volumeM3: 2.1 }] },
      { nombre: 'Concreto elevaciones', totalM3: 3.4, lines: [{ ok: true, volumeM3: 3.4 }], memoriaRows: [{ nombre: 'Elev', volumeM3: 3.4 }] },
    ]
    const plan = planEsquemaExportSalida({ title: 'Estructura', calcSnapshots: snaps })
    assert.equal(plan.hasMemoriaTable, true)
    assert.equal(plan.memoria.length, 4)
    assert.deepEqual(plan.memoria.map((m) => m.nombre), [
      'Excavación', 'Solado', 'Concreto bases', 'Concreto elevaciones',
    ])
    const sumNombres = plan.memoria.reduce((s, m) => s + m.totalM3, 0)
    assert.equal(sumNombres, 11.36 + 0.5 + 2.1 + 3.4)
    // No hay un único total agregado en el plan
    assert.equal(plan.memoria.every((m) => typeof m.totalM3 === 'number'), true)
  })

  it('contrato: un esquema no se borra', () => {
    const md = read('../../components/esquema/CONTRATO_ESQUEMA.md')
    assert.match(md, /un esquema no se borra|no se borra/i)
    assert.match(md, /Sin asignar/)
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /sicoeEsquemaRescate\.test\.js/)
  })
})
