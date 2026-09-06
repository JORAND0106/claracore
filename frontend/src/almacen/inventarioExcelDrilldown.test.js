/**
 * Inventario — Capítulo → Ítem → Insumo → OC, valores y trazabilidad.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Inventario — Capítulo → Ítem → Insumo → OC', () => {
  it('panel filtra por capítulo/ítem, sin gráfico, con % rentabilidad', () => {
    const src = readFileSync(join(__dirname, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /PresupuestoItemSelector/)
    assert.match(src, /itemMatchesFiltro/)
    assert.match(src, /Capítulo → Ítem → Insumo → OC/)
    assert.match(src, /% Rentabilidad/)
    assert.match(src, /rentabilidad_pct/)
    assert.match(src, /Valor entradas/)
    assert.match(src, /Valor salidas/)
    assert.match(src, /Ver todo el listado/)
    assert.doesNotMatch(src, /GraficoResumenInventario/)
    assert.doesNotMatch(src, /from 'recharts'/)
    assert.doesNotMatch(src, /BarChart/)
  })

  it('backend lista insumos con valores y OCs con trazabilidad', () => {
    const arbol = readFileSync(join(__dirname, '../../../backend/almacen_inventario_arbol.py'), 'utf8')
    assert.match(arbol, /_fetch_all_listado_rows/)
    assert.match(arbol, /def _fetch_oc_rows/)
    assert.match(arbol, /def _fetch_proveedor_map/)
    assert.match(arbol, /razon_social/)
    assert.doesNotMatch(arbol, /\.select\("id, nombre"\)/)
    assert.match(arbol, /_enrich_inventario_movimientos/)
    assert.match(arbol, /Se devuelve el listado de precios sin entradas/)
    assert.match(arbol, /_agregar_movimientos_por_insumo/)
    assert.match(arbol, /tiene_entrada/)
    assert.match(arbol, /tiene_salida/)
    assert.match(arbol, /ordenes_compra/)
    assert.match(arbol, /insumos/)
    assert.match(arbol, /rentabilidad_pct/)
    assert.match(arbol, /capitulos/)
    assert.match(arbol, /OC → Entrada → Salida/)
    assert.doesNotMatch(arbol, /material_descripcion"] = "Varios/)
  })

  it('drill-down Excel muestra valores por insumo y OCs al expandir', () => {
    const src = readFileSync(join(__dirname, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /cc-almacen-inventario-excel/)
    assert.match(src, /getInventarioArbol/)
    assert.match(src, /toggleItem/)
    assert.match(src, /toggleCap/)
    assert.match(src, /toggleInsumo/)
    assert.match(src, /FragmentCapitulo/)
    assert.match(src, /FragmentInsumo/)
    assert.match(src, /\.insumos/)
    assert.match(src, /insumoLabel/)
    assert.match(src, /ordenes_compra/)
    assert.match(src, /tiene_entrada/)
    assert.match(src, /tiene_salida/)
    assert.match(src, /Sin entrada/)
    assert.match(src, /Sin salida/)
    assert.match(src, /ins\.valor_entradas/)
    assert.match(src, /ins\.valor_salidas/)
    assert.match(src, /cc-almacen-inventario-trunc/)
    assert.match(src, /tableLayout: 'fixed'/)
    assert.doesNotMatch(src, /Ítem \/ Insumo \/ Proveedor/)
  })
})
