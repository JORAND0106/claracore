/**
 * Inventario — jerarquía Capítulo → Ítem → OC, filtro y gráfico.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Inventario — Capítulo → Ítem → OC', () => {
  it('panel filtra por capítulo/ítem y selecciona capítulo o ítem para el gráfico', () => {
    const src = readFileSync(join(__dirname, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /PresupuestoItemSelector/)
    assert.match(src, /itemMatchesFiltro/)
    assert.match(src, /selectedKey/)
    assert.match(src, /selectedKind/)
    assert.match(src, /chartResumen/)
    assert.match(src, /Resumen del ítem/)
    assert.match(src, /Resumen del capítulo/)
    assert.match(src, /Resumen general del contrato/)
    assert.match(src, /selectItem/)
    assert.match(src, /selectCapitulo/)
    assert.match(src, /Ver todo el listado/)
    assert.match(src, /Capítulo → Ítem → Orden de compra/)
  })

  it('backend agrega por capítulo e incluye órdenes de compra', () => {
    const arbol = readFileSync(join(__dirname, '../../../backend/almacen_inventario_arbol.py'), 'utf8')
    assert.match(arbol, /_fetch_all_listado_rows/)
    assert.match(arbol, /def _fetch_oc_rows/)
    assert.match(arbol, /def _fetch_proveedor_map/)
    assert.match(arbol, /razon_social/)
    assert.doesNotMatch(arbol, /\.select\("id, nombre"\)/)
    assert.match(arbol, /_enrich_inventario_movimientos/)
    assert.match(arbol, /Se devuelve el listado de precios sin entradas/)
    assert.match(arbol, /ordenes_compra/)
    assert.match(arbol, /capitulos/)
    assert.match(arbol, /Capítulo → Ítem → Orden de Compra/)
  })

  it('conserva drill-down Excel con celda de ítem ancha (no alta)', () => {
    const src = readFileSync(join(__dirname, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /cc-almacen-inventario-excel/)
    assert.match(src, /getInventarioArbol/)
    assert.match(src, /toggleItem/)
    assert.match(src, /toggleCap/)
    assert.match(src, /FragmentCapitulo/)
    assert.match(src, /ordenes_compra/)
    assert.match(src, /cc-almacen-inventario-trunc/)
    assert.match(src, /tableLayout: 'fixed'/)
    assert.doesNotMatch(src, /toggleInsumo/)
    assert.doesNotMatch(src, /Ítem \/ Insumo \/ Proveedor/)
  })
})
