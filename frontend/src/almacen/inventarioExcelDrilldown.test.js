/**
 * Inventario — correcciones listado, filtro y gráfico por selección.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Inventario — listado, filtro y gráfico dinámico', () => {
  it('panel filtra por capítulo/ítem y selecciona ítem para el gráfico', () => {
    const src = readFileSync(join(__dirname, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /PresupuestoItemSelector/)
    assert.match(src, /itemMatchesFiltro/)
    assert.match(src, /selectedKey/)
    assert.match(src, /chartResumen/)
    assert.match(src, /Resumen del ítem/)
    assert.match(src, /Resumen general del contrato/)
    assert.match(src, /selectItem/)
    assert.match(src, /Ver todo el listado/)
  })

  it('backend usa razon_social y soft-fail de enriquecimiento', () => {
    const arbol = readFileSync(join(__dirname, '../../../backend/almacen_inventario_arbol.py'), 'utf8')
    assert.match(arbol, /_fetch_all_listado_rows/)
    assert.match(arbol, /def _fetch_oc_rows/)
    assert.match(arbol, /def _fetch_proveedor_map/)
    assert.match(arbol, /razon_social/)
    assert.doesNotMatch(arbol, /\.select\("id, nombre"\)/)
    assert.match(arbol, /_enrich_inventario_movimientos/)
    assert.match(arbol, /Se devuelve el listado de precios sin entradas/)
  })

  it('conserva drill-down Excel', () => {
    const src = readFileSync(join(__dirname, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /cc-almacen-inventario-excel/)
    assert.match(src, /getInventarioArbol/)
    assert.match(src, /toggleInsumo/)
  })
})
