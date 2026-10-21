import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluarGenerarOc } from './generarOcRegla.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('quién puede generar la OC', () => {
  it('exige Validar y Contratista Gerencial; el desarrollador entra; el cargo no basta', () => {
    assert.equal(evaluarGenerarOc({
      contratistaGerencial: true,
      validar: true,
    }), true)
    assert.equal(evaluarGenerarOc({
      desarrollador: true,
    }), true)
    assert.equal(evaluarGenerarOc({
      validar: true,
    }), false)
    assert.equal(evaluarGenerarOc({
      contratistaGerencial: true,
    }), false)
    assert.equal(evaluarGenerarOc({
      excluido: true,
      desarrollador: true,
      contratistaGerencial: true,
      validar: true,
    }), false)
    assert.equal(evaluarGenerarOc({
      contratistaGerencial: false,
      validar: true,
    }), false)
  })

  it('la pantalla y el servidor usan la misma regla, no el cargo Administrador', () => {
    const permisos = readFileSync(join(dir, 'almacenPermisos.js'), 'utf8')
    const fn = permisos.slice(
      permisos.indexOf('export function puedeGenerarOrdenCompraAlmacen'),
      permisos.indexOf('export function puedeVerValoresEconomicosAlmacen'),
    )
    assert.match(fn, /evaluarGenerarOc/)
    assert.match(fn, /contratistaGerencial: esGerenciaContratistaRol/)
    assert.match(fn, /permisoAlmacen\(usuario, 'validar'/)
    assert.doesNotMatch(fn, /esCargoAdministrador/)
    const acceso = permisos.slice(permisos.indexOf('export function accesoAlmacen'))
    assert.match(acceso, /puedeGenerarOrdenCompraAlmacen\(usuario, cid\)/)

    const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    assert.match(detalle, /puedeGenerarOc &&/)
    assert.match(detalle, /Aprobar ítem|Aprobar todos los ítems/)
    const linea = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    assert.match(linea, /Aprobar ítem/)
    assert.doesNotMatch(linea, /Aprobar y generar OC/)

    const routes = readFileSync(join(dir, '../../../backend/almacen_routes.py'), 'utf8')
    const aprobar = routes.slice(
      routes.indexOf('def route_aprobar_solicitud'),
      routes.indexOf('def route_mapear_item_gerencial'),
    )
    assert.match(aprobar, /require_generar_orden_compra_almacen/)
    const reenviar = routes.slice(
      routes.indexOf('def route_reenviar_oc_correo'),
      routes.indexOf('def route_proximo_numero_disposicion'),
    )
    assert.match(reenviar, /require_generar_orden_compra_almacen/)
    const validarItem = routes.slice(
      routes.indexOf('def route_validar_item_solicitud'),
      routes.indexOf('def route_aprobar_todos_items'),
    )
    assert.match(validarItem, /require_permiso_almacen\(current_user, "validar"\)/)
    assert.doesNotMatch(validarItem, /require_generar_orden_compra_almacen/)

    const backend = readFileSync(join(dir, '../../../backend/almacen_permissions.py'), 'utf8')
    const pred = backend.slice(
      backend.indexOf('def puede_generar_orden_compra_almacen'),
      backend.indexOf('def puede_cambiar_proveedor_linea_aprobada'),
    )
    assert.match(pred, /es_gerencia_contratista_rol/)
    assert.match(pred, /tiene_permiso_almacen\(current_user, "validar"\)/)
    assert.doesNotMatch(pred, /es_cargo_administrador/)
    assert.match(backend, /rol Contratista Gerencial/)
    assert.doesNotMatch(
      backend.slice(backend.indexOf('def require_generar_orden_compra_almacen')),
      /cargo Administrador/,
    )
  })
})
