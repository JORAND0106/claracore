/**
 * Tres funciones independientes de Almacén.
 * node --test frontend/src/almacen/almacenPermisosFunciones.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

function tienePermisoAlgunaAccion(p) {
  return !!(p && (p.ver || p.crear || p.editar || p.eliminar || p.validar || p.exportar))
}

function accesoAlmacenMock(usuario) {
  const rows = usuario.permisos || []
  const by = (name) => rows.find((p) => (p.funcion_nombre || '').toLowerCase() === name.toLowerCase())
  const alm = by('Almacén')
  const cat = by('Catálogo de insumos')
  const ent = by('Entradas y Salidas')
  return {
    puedeEntrar: tienePermisoAlgunaAccion(alm) || tienePermisoAlgunaAccion(cat) || tienePermisoAlgunaAccion(ent),
    verSolicitudesInventario: tienePermisoAlgunaAccion(alm),
    verCatalogo: tienePermisoAlgunaAccion(cat),
    verEntradasSalidas: tienePermisoAlgunaAccion(ent),
    permisos: {
      ver: !!alm?.ver,
      crear: !!alm?.crear,
    },
  }
}

function puedeCrearSolicitud(p) {
  return Boolean(p?.ver && p?.crear)
}

describe('permisos Almacén por función independiente', () => {
  it('solo CATINS: entra al módulo pero no ve Solicitudes/Inventario ni Entradas', () => {
    const a = accesoAlmacenMock({
      permisos: [{ funcion_nombre: 'Catálogo de insumos', ver: true }],
    })
    assert.equal(a.puedeEntrar, true)
    assert.equal(a.verCatalogo, true)
    assert.equal(a.verSolicitudesInventario, false)
    assert.equal(a.verEntradasSalidas, false)
  })

  it('solo Entradas y Salidas: entra y ve movimientos, no Solicitudes', () => {
    const a = accesoAlmacenMock({
      permisos: [{ funcion_nombre: 'Entradas y Salidas', crear: true }],
    })
    assert.equal(a.puedeEntrar, true)
    assert.equal(a.verEntradasSalidas, true)
    assert.equal(a.verSolicitudesInventario, false)
  })

  it('crear solicitud exige Ver+Crear en Almacén', () => {
    assert.equal(puedeCrearSolicitud({ ver: true, crear: false }), false)
    assert.equal(puedeCrearSolicitud({ ver: true, crear: true }), true)
  })

  it('código separa ámbitos sin herencia por Almacén·editar al catálogo', () => {
    const helpers = readFileSync(join(dir, 'almacenPermisos.js'), 'utf8')
    const main = readFileSync(join(dir, 'AlmacenMain.jsx'), 'utf8')
    const app = readFileSync(join(dir, '../App.jsx'), 'utf8')
    assert.match(helpers, /tieneAccesoUiModuloAlmacen/)
    assert.match(helpers, /verEntradasSalidas/)
    assert.match(helpers, /puedeCrearSolicitudAlmacen/)
    assert.match(main, /verCatalogo/)
    assert.match(main, /ambito: 'entsal'/)
    assert.match(main, /puedeCrearSolicitudAlmacen/)
    assert.doesNotMatch(main, /Botón Insumos \+ crear\/editar insumos: solo con permiso Almacén/)
    assert.match(app, /almacenAcceso\.puedeEntrar/)
    assert.match(app, /entradasSalidas: almacenAcceso\.entradasSalidas/)
  })

  it('SQL y funciones requeridas incluyen ENTSAL', () => {
    const sql = readFileSync(join(dir, '../../../backend/sql/funcion_entradas_salidas.sql'), 'utf8')
    const mainPy = readFileSync(join(dir, '../../../backend/main.py'), 'utf8')
    const entsalJs = readFileSync(join(dir, 'entradasSalidasPermisos.js'), 'utf8')
    assert.match(sql, /ENTSAL/)
    assert.match(sql, /Entradas y Salidas/)
    assert.match(mainPy, /"ENTSAL"/)
    assert.match(entsalJs, /entradas y salidas/)
  })
})
