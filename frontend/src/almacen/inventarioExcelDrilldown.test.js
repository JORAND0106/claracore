/**
 * Inventario — tabla Excel con drill-down ítem/insumo/proveedor.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Inventario Excel drill-down', () => {
  it('panel usa árbol y deja de usar los 3 gráficos comparativos', () => {
    const src = readFileSync(join(__dirname, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /getInventarioArbol/)
    assert.match(src, /cc-almacen-inventario-excel/)
    assert.match(src, /inventario-resumen-chart/)
    assert.match(src, /Valor stock/)
    assert.match(src, /toggleItem/)
    assert.match(src, /toggleInsumo/)
    assert.doesNotMatch(src, /getInventarioGraficos/)
    assert.doesNotMatch(src, /Valor del ítem vs\. Costo de insumos/)
    assert.doesNotMatch(src, /Salidas vs\. Cobro/)
  })

  it('muestra columnas de nivel 1 y drill-down', () => {
    const src = readFileSync(join(__dirname, 'InventarioPanel.jsx'), 'utf8')
    for (const needle of [
      'VU Cobro',
      'VU Costo',
      'Rendimiento',
      'Utilidad',
      'Entradas',
      'Salidas',
      'Saldo',
      'proveedores',
      'expandedItems',
      'Filas contraídas por defecto',
    ]) {
      assert.match(src, new RegExp(needle))
    }
  })

  it('API expone getInventarioArbol', () => {
    const src = readFileSync(join(__dirname, 'almacenApi.js'), 'utf8')
    assert.match(src, /getInventarioArbol/)
    assert.match(src, /inventario\/arbol/)
  })

  it('backend tiene ruta y agregador de árbol', () => {
    const routes = readFileSync(join(__dirname, '../../../backend/almacen_routes.py'), 'utf8')
    assert.match(routes, /inventario\/arbol/)
    assert.match(routes, /list_inventario_arbol/)
    const arbol = readFileSync(join(__dirname, '../../../backend/almacen_inventario_arbol.py'), 'utf8')
    assert.match(arbol, /def build_inventario_arbol_from_lines/)
    assert.match(arbol, /def list_inventario_arbol/)
    assert.match(arbol, /Nivel 3: solo proveedores con stock/)
    assert.ok(arbol.includes('["proveedores"].append'))
  })
})
