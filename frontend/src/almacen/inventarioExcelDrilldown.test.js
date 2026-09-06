/**
 * Inventario — Capítulo → Ítem → Insumos, valores financieros y % rentabilidad.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Inventario — Capítulo → Ítem → Insumos', () => {
  it('panel filtra por capítulo/ítem, sin gráfico, con % rentabilidad', () => {
    const src = readFileSync(join(__dirname, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /PresupuestoItemSelector/)
    assert.match(src, /itemMatchesFiltro/)
    assert.match(src, /Capítulo → Ítem → Insumos/)
    assert.match(src, /% Rentabilidad/)
    assert.match(src, /rentabilidad_pct/)
    assert.match(src, /Valor entradas/)
    assert.match(src, /Valor salidas/)
    assert.match(src, /Ver todo el listado/)
    assert.doesNotMatch(src, /GraficoResumenInventario/)
    assert.doesNotMatch(src, /from 'recharts'/)
    assert.doesNotMatch(src, /BarChart/)
  })

  it('backend lista insumos reales y calcula rentabilidad financiera', () => {
    const arbol = readFileSync(join(__dirname, '../../../backend/almacen_inventario_arbol.py'), 'utf8')
    assert.match(arbol, /_fetch_all_listado_rows/)
    assert.match(arbol, /def _fetch_oc_rows/)
    assert.match(arbol, /def _fetch_proveedor_map/)
    assert.match(arbol, /razon_social/)
    assert.doesNotMatch(arbol, /\.select\("id, nombre"\)/)
    assert.match(arbol, /_enrich_inventario_movimientos/)
    assert.match(arbol, /Se devuelve el listado de precios sin entradas/)
    assert.match(arbol, /insumos/)
    assert.match(arbol, /rentabilidad_pct/)
    assert.match(arbol, /capitulos/)
    assert.match(arbol, /Capítulo → Ítem → Insumos/)
    assert.doesNotMatch(arbol, /material_descripcion"] = "Varios/)
  })

  it('drill-down Excel muestra insumos del ítem (celda ancha)', () => {
    const src = readFileSync(join(__dirname, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /cc-almacen-inventario-excel/)
    assert.match(src, /getInventarioArbol/)
    assert.match(src, /toggleItem/)
    assert.match(src, /toggleCap/)
    assert.match(src, /FragmentCapitulo/)
    assert.match(src, /\.insumos/)
    assert.match(src, /insumoLabel/)
    assert.match(src, /cc-almacen-inventario-trunc/)
    assert.match(src, /tableLayout: 'fixed'/)
    assert.doesNotMatch(src, /ordenes_compra/)
    assert.doesNotMatch(src, /Ítem \/ Insumo \/ Proveedor/)
  })
})
