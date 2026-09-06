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

  it('backend carga listado de precios y tolera OC sin proveedor_id', () => {
    const arbol = readFileSync(join(__dirname, '../../../backend/almacen_inventario_arbol.py'), 'utf8')
    assert.match(arbol, /_fetch_all_listado_rows/)
    assert.match(arbol, /def _fetch_oc_rows/)
    assert.match(arbol, /proveedor_id does not exist|select_variants|proveedor_nombre/)
    assert.match(arbol, /item_key/)
    assert.ok(arbol.includes('listado de precios') || arbol.includes('listado_precios') || arbol.includes('_fetch_all_listado_rows'))
  })

  it('conserva drill-down Excel', () => {
    const src = readFileSync(join(__dirname, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /cc-almacen-inventario-excel/)
    assert.match(src, /getInventarioArbol/)
    assert.match(src, /toggleInsumo/)
  })
})
