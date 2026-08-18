import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparRegistrosPorCompetencia,
  compararCompetenciaAsc,
  debeMostrarDesgloseCompetencia,
  encabezadoGrupoCompetencia,
  etiquetaCompetencia,
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

describe('agruparRegistrosPorCompetencia', () => {
  it('detecta dinámicamente competencias y prioriza sobre tipo entidad', () => {
    const regs = [
      { id: 1, competencia: 'IDU', tipo_entidad: 'Nodo' },
      { id: 2, competencia: 'ETB', tipo_entidad: 'Área' },
      { id: 3, competencia: 'IDU', tipo_entidad: 'Área' },
      { id: 4, competencia: 'Codensa', tipo_entidad: 'Longitud' },
    ]
    const bloques = agruparRegistrosPorCompetencia(regs)
    assert.deepEqual(bloques.map((b) => b.competencia), ['Codensa', 'ETB', 'IDU'])
    assert.equal(debeMostrarDesgloseCompetencia(bloques), true)

    // Dentro de IDU: Área → Unidad (Nodo)
    const gruposIdu = agruparRegistrosPorTipoEntidad(bloques.find((b) => b.competencia === 'IDU').registros)
    assert.deepEqual(gruposIdu.map((g) => g.key), ['area', 'unidad'])
    assert.deepEqual(gruposIdu[0].registros.map((r) => r.id), [3])
    assert.deepEqual(gruposIdu[1].registros.map((r) => r.id), [1])
  })

  it('no fuerza desglose si solo hay competencia vacía', () => {
    const bloques = agruparRegistrosPorCompetencia([
      { id: 1, competencia: '', tipo_entidad: 'Área' },
      { id: 2, competencia: null, tipo_entidad: 'Área' },
    ])
    assert.equal(bloques.length, 1)
    assert.equal(debeMostrarDesgloseCompetencia(bloques), false)
  })

  it('sí muestra banner con una sola competencia nombrada', () => {
    const bloques = agruparRegistrosPorCompetencia([
      { id: 1, competencia: 'IDU', tipo_entidad: 'Área' },
    ])
    assert.equal(debeMostrarDesgloseCompetencia(bloques), true)
    assert.equal(encabezadoGrupoCompetencia(bloques[0].label), 'Competencia: IDU')
  })
})

describe('planFilasResumenConSubtotales + competencias', () => {
  const resumen = [
    { capitulo: '1', item: '1.1', vlr_unitario: 100, cantidad: 2, costo_directo: 200 },
    { capitulo: '1', item: '1.2', vlr_unitario: 50, cantidad: 3, costo_directo: 150 },
    { capitulo: '2', item: '2.1', vlr_unitario: 10, cantidad: 10, costo_directo: 100 },
  ]
  const competencias = [
    { capitulo: '1', competencia: 'IDU', cantidad: 4, costo_directo: 280 },
    { capitulo: '1', competencia: 'ETB', cantidad: 1, costo_directo: 70 },
    { capitulo: '2', competencia: 'IDU', cantidad: 10, costo_directo: 100 },
  ]

  it('inserta sub-filas de competencia antes del subtotal de capítulo', () => {
    const plan = planFilasResumenConSubtotales(resumen, competencias)
    assert.deepEqual(
      plan.map((p) => {
        if (p.tipo === 'item') return `item:${p.row.item}`
        if (p.tipo === 'competencia') return `comp:${p.label}`
        return `sub:${p.capitulo}`
      }),
      ['item:1.1', 'item:1.2', 'comp:ETB', 'comp:IDU', 'sub:1', 'item:2.1', 'comp:IDU', 'sub:2'],
    )
    const { costoDirecto, porCapitulo } = totalesDesdeSubtotalesCapitulo(plan)
    assert.deepEqual(porCapitulo, [
      { capitulo: '1', costoDirecto: 350 },
      { capitulo: '2', costoDirecto: 100 },
    ])
    assert.equal(costoDirecto, 450)
    // Σ competencias cap 1 = subtotal cap 1
    const comps1 = plan.filter((p) => p.tipo === 'competencia' && p.capitulo === '1')
    assert.equal(comps1.reduce((s, c) => s + c.costoDirecto, 0), 350)
  })

  it('sin competencias nombradas mantiene el plan anterior (solo subtotales)', () => {
    const plan = planFilasResumenConSubtotales(resumen, [])
    assert.deepEqual(
      plan.map((p) => (p.tipo === 'item' ? `item:${p.row.item}` : `sub:${p.capitulo}`)),
      ['item:1.1', 'item:1.2', 'sub:1', 'item:2.1', 'sub:2'],
    )
  })

  it('indexCompetenciasPorCapitulo agrupa y ordena', () => {
    const idx = indexCompetenciasPorCapitulo(competencias)
    assert.deepEqual(
      idx.get('1').map((c) => c.competencia),
      ['ETB', 'IDU'],
    )
  })
})
