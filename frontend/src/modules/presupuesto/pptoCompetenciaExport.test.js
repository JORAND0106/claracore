import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparRegistrosPorCompetencia,
  compararCompetenciaAsc,
  debeMostrarDesgloseCompetencia,
  encabezadoGrupoCompetencia,
  etiquetaCompetencia,
  filtrarGraficosPorRegistrosBloque,
  indexCompetenciasPorCapitulo,
  PPTO_COMPETENCIA_SIN,
} from './pptoCompetenciaExport.js'
import { agruparRegistrosPorTipoEntidad } from './pptoTipoEntidad.js'
import { planFilasResumenConSubtotales, totalesDesdeSubtotalesCapitulo } from './pptoResumenExport.js'

describe('etiquetaCompetencia / orden', () => {
  it('usa (Sin competencia) para vacío y ordena vacíos al final', () => {
    assert.equal(etiquetaCompetencia(''), PPTO_COMPETENCIA_SIN)
    assert.equal(etiquetaCompetencia('IDU'), 'IDU')
    assert.ok(compararCompetenciaAsc('ETB', 'IDU') < 0)
    assert.ok(compararCompetenciaAsc('', 'IDU') > 0)
  })
})

describe('agruparRegistrosPorCompetencia — filtro real', () => {
  it('cada bloque contiene únicamente registros de esa competencia', () => {
    const regs = [
      { id: 1, competencia: 'IDU', tipo_entidad: 'Nodo' },
      { id: 2, competencia: 'ETB', tipo_entidad: 'Área' },
      { id: 3, competencia: 'IDU', tipo_entidad: 'Área' },
      { id: 4, competencia: 'Codensa', tipo_entidad: 'Longitud' },
    ]
    const bloques = agruparRegistrosPorCompetencia(regs)
    assert.deepEqual(bloques.map((b) => b.competencia), ['Codensa', 'ETB', 'IDU'])
    for (const b of bloques) {
      assert.ok(b.registros.every((r) => String(r.competencia).trim() === b.competencia))
    }
    assert.deepEqual(bloques.find((b) => b.competencia === 'IDU').registros.map((r) => r.id), [1, 3])
    assert.deepEqual(bloques.find((b) => b.competencia === 'ETB').registros.map((r) => r.id), [2])

    const gruposIdu = agruparRegistrosPorTipoEntidad(bloques.find((b) => b.competencia === 'IDU').registros)
    assert.deepEqual(gruposIdu.map((g) => g.key), ['area', 'unidad'])
  })

  it('banner incluye conteo de registros del bloque', () => {
    assert.equal(encabezadoGrupoCompetencia('IDU', 12), 'Competencia: IDU — 12 registros')
    assert.equal(encabezadoGrupoCompetencia('ETB', 1), 'Competencia: ETB — 1 registro')
  })

  it('filtrarGraficosPorRegistrosBloque solo deja gráficos con ids del bloque', () => {
    const grafs = [
      { caption: 'A', presupuesto_ids: [1, 2], image: {} },
      { caption: 'B', presupuesto_ids: [9], image: {} },
      { caption: 'C', presupuesto_ids: [], image: {} },
    ]
    const out = filtrarGraficosPorRegistrosBloque(grafs, [{ id: 1 }, { id: 3 }])
    assert.deepEqual(out.map((g) => g.caption), ['A', 'C'])
  })
})

describe('planFilasResumenConSubtotales — desdoblamiento real', () => {
  it('emite cabecera COMPETENCIA y luego ítems solo de esa competencia (no consolidados)', () => {
    // Grano backend: (capítulo, ítem, competencia)
    const resumen = [
      { capitulo: '1', item: '1.1', competencia: 'IDU', cantidad: 2, costo_directo: 200 },
      { capitulo: '1', item: '1.1', competencia: 'ETB', cantidad: 1, costo_directo: 100 },
      { capitulo: '1', item: '1.2', competencia: 'IDU', cantidad: 3, costo_directo: 150 },
      { capitulo: '2', item: '2.1', competencia: 'IDU', cantidad: 10, costo_directo: 100 },
    ]
    const plan = planFilasResumenConSubtotales(resumen)
    assert.deepEqual(
      plan.map((p) => {
        if (p.tipo === 'item') return `item:${p.row.item}@${p.row.competencia}:${p.row.cantidad}`
        if (p.tipo === 'competencia') return `comp:${p.label}:${p.cantidad}`
        return `sub:${p.capitulo}`
      }),
      [
        'comp:ETB:1',
        'item:1.1@ETB:1',
        'comp:IDU:5',
        'item:1.1@IDU:2',
        'item:1.2@IDU:3',
        'sub:1',
        'comp:IDU:10',
        'item:2.1@IDU:10',
        'sub:2',
      ],
    )
    // Ítems bajo desglose marcan cantidad absoluta (no fórmula a memoria completa)
    const items = plan.filter((p) => p.tipo === 'item')
    assert.ok(items.every((p) => p.cantidadAbsoluta === true))
    assert.equal(totalesDesdeSubtotalesCapitulo(plan).costoDirecto, 550)
  })

  it('sin competencias nombradas: ítems planos + subtotal (sin cabeceras)', () => {
    const resumen = [
      { capitulo: '1', item: '1.1', competencia: '', cantidad: 2, costo_directo: 200 },
      { capitulo: '1', item: '1.2', competencia: '', cantidad: 3, costo_directo: 151 },
    ]
    const plan = planFilasResumenConSubtotales(resumen)
    assert.deepEqual(
      plan.map((p) => (p.tipo === 'item' ? `item:${p.row.item}` : `sub:${p.capitulo}`)),
      ['item:1.1', 'item:1.2', 'sub:1'],
    )
    assert.ok(plan.filter((p) => p.tipo === 'item').every((p) => p.cantidadAbsoluta === false))
  })

  it('indexCompetenciasPorCapitulo agrupa y ordena', () => {
    const idx = indexCompetenciasPorCapitulo([
      { capitulo: '1', competencia: 'IDU', cantidad: 4, costo_directo: 280 },
      { capitulo: '1', competencia: 'ETB', cantidad: 1, costo_directo: 70 },
    ])
    assert.deepEqual(idx.get('1').map((c) => c.competencia), ['ETB', 'IDU'])
    assert.equal(debeMostrarDesgloseCompetencia(idx.get('1')), true)
  })
})
