/**
 * Partición de una selección de tramo/PK-ID en una línea por PK-ID.
 * node --test frontend/src/almacen/solicitudTramoSeleccion.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  crearLineasPorPk,
  etiquetaGrupo,
  gruposDeLineas,
  resumenAccionBloque,
  saldoSeleccion,
} from './solicitudTramoSeleccion.js'

const dir = dirname(fileURLToPath(import.meta.url))

function pk(id, saldo, registros = []) {
  return {
    pk_id: id,
    tramo: '7',
    saldo_disponible: saldo,
    registros: registros.length
      ? registros
      : [{ presupuesto_id: Number(id) * 10, saldo_disponible: saldo, abscisa_inicial: 100, abscisa_final: 200, calzada: 'Derecho' }],
  }
}

describe('crearLineasPorPk', () => {
  const grupos = [pk('1', 30), pk('2', 40), pk('3', 30)]

  it('pide el total del tramo y deja una línea por PK-ID (30, 40, 30)', () => {
    const lineas = crearLineasPorPk({
      cantidad: 100,
      gruposPk: grupos,
      grupoId: 'g1',
      grupoEtiqueta: 'Tramo 7 · cemento',
      plantilla: { descripcion_solicitada: 'cemento', es_principal: true },
    })
    assert.deepEqual(lineas.map((l) => l.cantidad), [30, 40, 30])
    assert.deepEqual(lineas.map((l) => l.pk_id), ['1', '2', '3'])
    assert.equal(new Set(lineas.map((l) => l.grupo_seleccion)).size, 1)
    assert.equal(lineas[0].grupo_etiqueta, 'Tramo 7 · cemento')
    assert.equal(lineas[0].descripcion_solicitada, 'cemento')
    assert.equal(lineas[0].costado, 'Derecho')
    assert.equal(lineas.every((l) => l.es_principal === true), true)
  })

  it('reparte 50 en proporción al saldo (15, 20, 15)', () => {
    const lineas = crearLineasPorPk({
      cantidad: 50,
      gruposPk: grupos,
      grupoId: 'g2',
      plantilla: { es_principal: false, descripcion_solicitada: 'asociado' },
    })
    assert.deepEqual(lineas.map((l) => l.cantidad), [15, 20, 15])
    assert.equal(lineas.every((l) => l.es_principal === false), true)
  })

  it('un solo PK-ID genera una línea', () => {
    const lineas = crearLineasPorPk({
      cantidad: 30,
      gruposPk: [pk('2', 40)],
      grupoId: 'g3',
      plantilla: {},
    })
    assert.equal(lineas.length, 1)
    assert.equal(lineas[0].pk_id, '2')
    assert.equal(lineas[0].cantidad, 30)
  })

  it('dentro del PK reparte entre registros según su saldo', () => {
    const lineas = crearLineasPorPk({
      cantidad: 30,
      gruposPk: [pk('1', 30, [
        { presupuesto_id: 11, saldo_disponible: 10, abscisa_inicial: 10, abscisa_final: 20 },
        { presupuesto_id: 12, saldo_disponible: 20, abscisa_inicial: 20, abscisa_final: 40 },
      ])],
      grupoId: 'g4',
      plantilla: {},
    })
    assert.equal(lineas.length, 1)
    assert.deepEqual(lineas[0].presupuesto_ids, [11, 12])
    const cant = lineas[0].registros_presupuesto.map((r) => r.cantidad)
    assert.equal(cant[0] + cant[1], 30)
    assert.ok(cant[1] > cant[0])
    assert.equal(lineas[0].abscisa_inicial, 10)
    assert.equal(lineas[0].abscisa_final, 40)
  })

  it('omite PK-ID sin saldo para no absorber el residuo', () => {
    const lineas = crearLineasPorPk({
      cantidad: 40,
      gruposPk: [pk('1', 0), pk('2', 40)],
      grupoId: 'g5',
      plantilla: {},
    })
    assert.equal(lineas.length, 1)
    assert.equal(lineas[0].pk_id, '2')
    assert.equal(lineas[0].cantidad, 40)
  })
})

describe('saldoSeleccion', () => {
  it('no cuenta dos veces un PK que ya entra en el tramo', () => {
    const total = saldoSeleccion({
      tramos: [{ tramo: '7', saldo_disponible: 100 }],
      pks: [{ tramo: '7', pk_id: '1', saldo_disponible: 30 }],
      registros: [{ tramo: '7', pk_id: '1', saldo_disponible: 10, presupuesto_id: 1 }],
    })
    assert.equal(total, 100)
  })

  it('suma PK y registros sueltos de otro tramo', () => {
    const total = saldoSeleccion({
      tramos: [{ tramo: '7', saldo_disponible: 100 }],
      pks: [{ tramo: '8', pk_id: '9', saldo_disponible: 12 }],
      registros: [{ tramo: '9', pk_id: '4', saldo_disponible: 5, presupuesto_id: 4 }],
    })
    assert.equal(total, 117)
  })
})

describe('grupos y resultado en bloque', () => {
  it('etiqueta varios tramos y agrupa por id', () => {
    assert.match(etiquetaGrupo(['7'], 'cemento gris'), /^Tramo 7 · cemento gris/)
    assert.match(etiquetaGrupo(['7', '8', '7'], 'x'), /^Tramos 7, 8/)
    const grupos = gruposDeLineas([
      { id: 1, grupo_seleccion: 'a', grupo_etiqueta: 'Tramo 7' },
      { id: 2, grupo_seleccion: 'a' },
      { id: 3, grupo_seleccion: '' },
      { id: 4, grupo_seleccion: 'b', grupo_etiqueta: 'Tramo 8' },
    ])
    assert.equal(grupos.length, 2)
    assert.equal(grupos[0].items.length, 2)
    assert.equal(grupos[1].etiqueta, 'Tramo 8')
  })

  it('lista las líneas que no se aprobaron y calla si todas quedaron bien', () => {
    assert.equal(resumenAccionBloque([{ ok: true }, { ok: true }], 'Aprobadas'), '')
    const msg = resumenAccionBloque([
      { ok: true, numero_linea: 1 },
      { ok: false, numero_linea: 2, error: 'Falta asignar el insumo del catálogo.' },
      { ok: false, item_id: 9, error: 'Ya forma parte de la Orden de Compra.' },
    ], 'Aprobadas')
    assert.match(msg, /Aprobadas: 1 línea/)
    assert.match(msg, /Línea #2: Falta asignar el insumo/)
    assert.match(msg, /Línea id 9: Ya forma parte/)
  })
})

describe('cableado de la solicitud', () => {
  it('AIU no abre el acordeón y el mapa sigue en la grilla', () => {
    const form = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
    const excel = readFileSync(join(dir, 'SolicitudFormExcelTable.jsx'), 'utf8')
    assert.match(form, /SolicitudTramoAccordion/)
    assert.match(form, /if \(item && !esAiu && !locked\) setTramoFlow\(idx\)/)
    assert.match(form, /grupo_seleccion: it\.grupo_seleccion/)
    assert.match(excel, /phase: 'mapa'/)
    assert.match(excel, /onAbrirTramos/)
    assert.match(excel, /!esAiu &&/)
    assert.match(excel, /AlmacenPkMapaSelector/)
  })

  it('asignar en bloque exige editar y aprobar en bloque exige gerencial', () => {
    const routes = readFileSync(join(dir, '../../../backend/almacen_routes.py'), 'utf8')
    const mapear = routes.slice(routes.indexOf('def route_mapear_items_bloque'))
    const aprobar = mapear.slice(mapear.indexOf('def route_aprobar_items_bloque'))
    const soloMapear = mapear.slice(0, mapear.indexOf('def route_aprobar_items_bloque'))
    assert.match(soloMapear, /require_permiso_almacen\(current_user, "editar"\)/)
    assert.doesNotMatch(soloMapear, /require_contratista_gerencial_almacen/)
    assert.match(aprobar, /require_contratista_gerencial_almacen\(current_user\)/)
  })

  it('la revisión muestra el grupo y la grilla permite selección', () => {
    const rev = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    const tabla = readFileSync(join(dir, 'SolicitudMaterialesExcelTable.jsx'), 'utf8')
    const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    assert.match(rev, /grupo_etiqueta/)
    assert.match(tabla, /onAsignarGrupo/)
    assert.match(tabla, /onAprobarGrupo/)
    assert.match(detalle, /mapearItemsBloque/)
    assert.match(detalle, /aprobarItemsBloque/)
    assert.match(detalle, /Aprobar todos los ítems/)
    assert.doesNotMatch(detalle, /Rechazar selección|rechazarItemsBloque|rechazar-bloque/)
  })
})
