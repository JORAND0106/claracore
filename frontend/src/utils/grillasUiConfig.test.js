import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGridTemplate,
  mergeGrillasUiConfig,
  patchColumnVisible,
  patchColumnWidth,
  resolveVisibleColumns,
} from './grillasUiConfig.js'

describe('mergeGrillasUiConfig', () => {
  it('defaults todas visibles', () => {
    const m = mergeGrillasUiConfig(null)
    assert.equal(m.sicoe_obra.columns.every((c) => c.visible), true)
    assert.ok(m.sicoe_obra.columns.some((c) => c.id === 'costado'))
  })

  it('respeta costado oculto', () => {
    const m = mergeGrillasUiConfig({
      sicoe_obra: {
        columns: [{ id: 'costado', visible: false, width: 80 }],
      },
    })
    const costado = m.sicoe_obra.columns.find((c) => c.id === 'costado')
    assert.equal(costado.visible, false)
  })

  it('locked numero_reporte siempre visible', () => {
    const m = mergeGrillasUiConfig({
      sicoe_obra: {
        columns: [{ id: 'numero_reporte', visible: false }],
      },
    })
    assert.equal(m.sicoe_obra.columns.find((c) => c.id === 'numero_reporte').visible, true)
  })
})

describe('resolveVisibleColumns', () => {
  it('omite costado si invisible y economia si rol no ve', () => {
    const cfg = mergeGrillasUiConfig({
      sicoe_obra: {
        columns: [
          { id: 'costado', visible: false },
          { id: 'costo_directo', visible: true },
        ],
      },
    })
    const cols = resolveVisibleColumns('sicoe_obra', cfg, { verEconomia: false })
    assert.equal(cols.some((c) => c.id === 'costado'), false)
    assert.equal(cols.some((c) => c.id === 'costo_directo'), false)
    assert.equal(cols.some((c) => c.id === 'numero_reporte'), true)
  })

  it('buildGridTemplate incluye fr para descripcion', () => {
    const cols = resolveVisibleColumns('sicoe_obra', null, { verEconomia: true })
    const tpl = buildGridTemplate(cols)
    assert.match(tpl, /1\.4fr/)
    assert.match(tpl, /64px/)
  })
})

describe('patch helpers', () => {
  it('patch width y visible', () => {
    let cfg = mergeGrillasUiConfig(null)
    cfg = patchColumnWidth(cfg, 'sicoe_obra', 'tramo', 120)
    assert.equal(cfg.sicoe_obra.columns.find((c) => c.id === 'tramo').width, 120)
    cfg = patchColumnVisible(cfg, 'presupuesto', 'competencia', false)
    assert.equal(cfg.presupuesto.columns.find((c) => c.id === 'competencia').visible, false)
  })
})
