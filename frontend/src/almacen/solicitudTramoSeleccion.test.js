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
  calcularRepartoManual,
  compararCantidadConSaldo,
  crearLineasPorPk,
  etiquetaGrupo,
  gruposDeLineas,
  lineasDesdePedido,
  repartirExacto,
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

function suma(valores) {
  return valores.reduce((a, b) => a + b, 0)
}

describe('alerta de saldo solo en principal', () => {
  it('el asociado no se compara con el saldo y el principal sí', () => {
    assert.equal(compararCantidadConSaldo(false), false)
    assert.equal(compararCantidadConSaldo(true), true)
    assert.equal(compararCantidadConSaldo(undefined), true)
  })
})

describe('reparto manual exacto', () => {
  const arbol = [{
    key: '7',
    saldo: 100,
    pks: [
      { key: '7||1', saldo: 25, regs: [{ key: '11', saldo: 10 }, { key: '12', saldo: 15 }] },
      { key: '7||2', saldo: 75, regs: [{ key: '21', saldo: 75 }] },
    ],
  }]

  it('la suma de repartirExacto es el total escrito', () => {
    const partes = repartirExacto(100, [1, 3])
    assert.deepEqual(partes, [25, 75])
    assert.equal(suma(partes), 100)
    const tercios = repartirExacto(1, [1, 1, 1])
    assert.ok(Math.abs(suma(tercios) - 1) < 1e-9)
    assert.notEqual(Math.round(tercios[0] * 10000) / 10000, tercios[0])
  })

  it('un tramo de 100 con saldos 1:3 reparte 25 y 75, y cada PK entre sus registros', () => {
    const { pedir } = calcularRepartoManual(arbol, { tramo: { 7: '100' }, pk: {}, reg: {} })
    assert.equal(pedir.pk['7||1'], 25)
    assert.equal(pedir.pk['7||2'], 75)
    assert.equal(pedir.tramo['7'], 100)
    assert.equal(suma([pedir.reg['11'], pedir.reg['12']]), 25)
    assert.equal(pedir.reg['21'], 75)
    assert.ok(pedir.reg['12'] > pedir.reg['11'])
  })

  it('un PK fijado en 40 deja 60 para el hermano libre', () => {
    const { pedir } = calcularRepartoManual(arbol, {
      tramo: { 7: '100' },
      pk: { '7||1': '40' },
      reg: {},
    })
    assert.equal(pedir.pk['7||1'], 40)
    assert.equal(pedir.pk['7||2'], 60)
    assert.equal(pedir.tramo['7'], 100)
    assert.equal(suma(Object.values(pedir.pk)), 100)
  })

  it('un registro fijado no se vuelve a repartir', () => {
    const { pedir } = calcularRepartoManual([{
      key: '7',
      saldo: 100,
      pks: [{
        key: '7||1',
        saldo: 100,
        regs: [
          { key: '11', saldo: 10 },
          { key: '12', saldo: 20 },
          { key: '13', saldo: 20 },
        ],
      }],
    }], { tramo: {}, pk: { '7||1': '60' }, reg: { 11: '10' } })
    assert.equal(pedir.reg['11'], 10)
    assert.equal(pedir.reg['12'], 25)
    assert.equal(pedir.reg['13'], 25)
    assert.equal(suma([pedir.reg['11'], pedir.reg['12'], pedir.reg['13']]), 60)
  })

  it('si un registro sube el PK, el hermano libre se recalcula y la suma sigue siendo lo escrito', () => {
    const { pedir, excede } = calcularRepartoManual([{
      key: '7',
      saldo: 100,
      pks: [
        { key: '7||1', saldo: 50, regs: [{ key: 'a', saldo: 50 }] },
        { key: '7||2', saldo: 50, regs: [{ key: 'b', saldo: 50 }] },
      ],
    }], { tramo: { 7: '100' }, pk: {}, reg: { a: '90' } })
    assert.equal(pedir.reg.a, 90)
    assert.equal(pedir.pk['7||1'], 90)
    assert.equal(pedir.pk['7||2'], 10)
    assert.equal(pedir.reg.b, 10)
    assert.equal(pedir.tramo['7'], 100)
    assert.equal(excede.pk['7||1'], true)
    assert.equal(excede.reg.a, true)
  })

  it('si lo fijado supera lo escrito, el total del tramo pasa a ser la suma', () => {
    const { pedir, excede } = calcularRepartoManual([{
      key: '7',
      saldo: 100,
      pks: [
        { key: '7||1', saldo: 80, regs: [] },
        { key: '7||2', saldo: 50, regs: [] },
      ],
    }], { tramo: { 7: '100' }, pk: { '7||1': '80', '7||2': '50' }, reg: {} })
    assert.equal(pedir.pk['7||1'], 80)
    assert.equal(pedir.pk['7||2'], 50)
    assert.equal(pedir.tramo['7'], 130)
    assert.equal(excede.tramo['7'], true)
  })

  it('escribir en un PK reparte solo entre sus registros', () => {
    const { pedir } = calcularRepartoManual(arbol, { tramo: {}, pk: { '7||1': '20' }, reg: {} })
    assert.equal(pedir.pk['7||1'], 20)
    assert.equal(pedir.pk['7||2'], undefined)
    assert.equal(suma([pedir.reg['11'], pedir.reg['12']]), 20)
    assert.equal(pedir.tramo['7'], 20)
  })

  it('una fila en cero no genera línea y el manual conserva material y principal', () => {
    const tramos = [{ tramo: '7' }]
    const pksByTramo = {
      7: [
        { pk_id: '1', tramo: '7' },
        { pk_id: '2', tramo: '7' },
      ],
    }
    const regsByPk = {
      '7||1': [{ presupuesto_id: 11, saldo_disponible: 10, abscisa_inicial: 1, abscisa_final: 2 }],
      '7||2': [{ presupuesto_id: 21, saldo_disponible: 30, abscisa_inicial: 3, abscisa_final: 4 }],
    }
    const { pedir } = calcularRepartoManual(arbol, { tramo: { 7: '20' }, pk: {}, reg: {} })
    const lineas = lineasDesdePedido({
      tramos,
      pksByTramo,
      regsByPk,
      pedir,
      plantilla: {
        descripcion_solicitada: 'cemento',
        es_principal: false,
        observacion_residente: 'nota',
      },
      grupoId: 'g',
      grupoEtiqueta: 'Tramo 7',
    })
    assert.equal(lineas.length, 2)
    assert.equal(suma(lineas.map((l) => l.cantidad)), 20)
    assert.equal(lineas[0].descripcion_solicitada, 'cemento')
    assert.equal(lineas[0].es_principal, false)
    assert.equal(lineas[0].observacion_residente, 'nota')
    const soloCero = lineasDesdePedido({
      tramos,
      pksByTramo,
      regsByPk,
      pedir: { pk: { '7||1': 0, '7||2': 0 }, reg: {} },
      plantilla: {},
    })
    assert.equal(soloCero.length, 0)
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

  it('el acordeón pide a mano y Resumen abre el mismo editor', () => {
    const acordeon = readFileSync(join(dir, 'SolicitudTramoAccordion.jsx'), 'utf8')
    const resumen = readFileSync(join(dir, 'ResumenProveedoresPanel.jsx'), 'utf8')
    const main = readFileSync(join(dir, 'AlmacenMain.jsx'), 'utf8')
    assert.match(acordeon, /Pedir/)
    assert.match(acordeon, /Repartir de nuevo/)
    assert.match(acordeon, /justificación/)
    assert.match(acordeon, /compararCantidadConSaldo\(prinLocal\)/)
    assert.match(acordeon, /const marcaSobreSaldo = compararCantidadConSaldo\(prinLocal\)/)
    const cuerpo = acordeon.slice(acordeon.indexOf('const ocupado'))
    assert.doesNotMatch(cuerpo, /const esPrincipal/)
    assert.match(acordeon, /solo a insumos Principales/)
    assert.doesNotMatch(acordeon, /La cantidad no puede superar el saldo disponible/)
    assert.doesNotMatch(acordeon, /fmtMoney/)
    assert.match(resumen, /data-testid="resumen-editar-materiales"/)
    assert.match(resumen, /SolicitudFormModal/)
    assert.match(resumen, /onEdit=/)
    assert.match(resumen, /onReabrirOc=/)
    const bloque = main.slice(main.indexOf('<ResumenProveedoresPanel'), main.indexOf("tab === 'entradas'"))
    assert.match(bloque, /token=\{token\}/)
    assert.match(bloque, /t=\{t\}/)
  })

  it('asignar en bloque exige editar y aprobar en bloque exige validar', () => {
    const routes = readFileSync(join(dir, '../../../backend/almacen_routes.py'), 'utf8')
    const mapear = routes.slice(routes.indexOf('def route_mapear_items_bloque'))
    const aprobar = mapear.slice(mapear.indexOf('def route_aprobar_items_bloque'))
    const soloAprobar = aprobar.slice(0, aprobar.indexOf('def route_corregir_insumo_post_oc'))
    const soloMapear = mapear.slice(0, mapear.indexOf('def route_aprobar_items_bloque'))
    assert.match(soloMapear, /require_permiso_almacen\(current_user, "editar"\)/)
    assert.doesNotMatch(soloMapear, /require_contratista_gerencial_almacen/)
    assert.match(soloAprobar, /require_permiso_almacen\(current_user, "validar"\)/)
    assert.doesNotMatch(soloAprobar, /require_contratista_gerencial_almacen/)
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
    assert.match(detalle, /data-testid="rechazar-seleccion"/)
    assert.match(detalle, /data-testid="rechazar-solicitud-completa"/)
    assert.match(detalle, /rechazarLineasSolicitud/)
  })

  it('asignar en bloque permite elegir proveedor y avisa si hay remapeo', () => {
    const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    const routes = readFileSync(join(dir, '../../../backend/almacen_routes.py'), 'utf8')
    const svc = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    assert.match(detalle, /ProveedorOfertaField/)
    assert.match(detalle, /data-testid="asignar-bloque-proveedor"/)
    assert.match(detalle, /proveedor_seleccionado_id/)
    assert.match(detalle, /data-testid="asignar-bloque-aviso-remapear"/)
    assert.match(detalle, /Asignando…/)
    assert.match(detalle, /data-testid="asignar-bloque-ok"/)
    assert.match(detalle, /data-testid="asignar-bloque-error"/)
    assert.match(detalle, /setAsignar\(null\)/)
    assert.match(detalle, /setAsignarError/)
    const body = routes.slice(routes.indexOf('class MapearBloqueBody'), routes.indexOf('class AprobarBloqueBody'))
    assert.match(body, /proveedor_seleccionado_id/)
    const mapear = svc.slice(svc.indexOf('def mapear_items_bloque'), svc.indexOf('def aprobar_items_bloque'))
    assert.doesNotMatch(mapear, /mapear_item_solicitud_gerencial/)
    assert.match(mapear, /_update_solicitud_items_batch/)
    assert.match(mapear, /"solicitud_id": int\(solicitud_id\)/)
  })
})
