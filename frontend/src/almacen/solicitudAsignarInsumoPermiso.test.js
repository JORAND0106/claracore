/**
 * Asignar insumo en Revisión de línea depende de Editar.
 * Aprobar ítem / OC sigue en Validar + Contratista Gerencial.
 * node --test frontend/src/almacen/solicitudAsignarInsumoPermiso.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

function solicitudTieneOrdenCompra(sol) {
  if (sol?.tiene_orden_compra) return true
  return Boolean(sol?.orden_compra?.id)
}

function puedeAbrirRevisionLinea(permisos) {
  return Boolean(
    permisos?.editar
    || permisos?.esContratistaGerencial
    || permisos?.esDesarrollador,
  )
}

function itemPuedeAsignarInsumo(item, sol, permisos) {
  if (!permisos?.editar || !item?.id) return false
  if (item.en_orden_compra) return false
  const ev = item.estado_validacion || 'pendiente'
  if (ev === 'aprobado') return false
  const estado = String(sol?.estado || '')
  if (!['borrador', 'rechazada', 'enviada', 'aprobada'].includes(estado)) return false
  if (solicitudTieneOrdenCompra(sol) && estado !== 'aprobada') return false
  return true
}

function itemPuedeCorregirInsumoPostOc(item, sol, permisos) {
  const esGerencial = Boolean(permisos?.esContratistaGerencial || permisos?.esDesarrollador)
  if (!esGerencial || !permisos?.editar || !item?.id) return false
  if (!solicitudTieneOrdenCompra(sol)) return false
  if (sol?.puede_corregir_insumo_post_oc === false) return false
  if (sol?.orden_compra?.tiene_entradas) return false
  return true
}

function solicitudPuedeValidar(sol, permisos) {
  const esGerencial = Boolean(permisos?.esContratistaGerencial || permisos?.esDesarrollador)
  if (!permisos?.validar || !esGerencial) return false
  if (sol?.estado === 'enviada' && !solicitudTieneOrdenCompra(sol)) return true
  return false
}

const editar = { editar: true, validar: false, esContratistaGerencial: false }
const validarGerencial = { editar: false, validar: true, esContratistaGerencial: true }
const ambos = { editar: true, validar: true, esContratistaGerencial: true }
const solEnviada = { estado: 'enviada' }
const linea = { id: 9, estado_validacion: 'pendiente', insumo_id: null }

describe('Asignar insumo — permiso Editar', () => {
  it('abre el popup con Editar, sin rol gerencial', () => {
    assert.equal(puedeAbrirRevisionLinea(editar), true)
    assert.equal(puedeAbrirRevisionLinea({ crear: true }), false)
    assert.equal(puedeAbrirRevisionLinea({ validar: true }), false)
    assert.equal(puedeAbrirRevisionLinea(validarGerencial), true)
  })

  it('asigna insumo en línea pendiente solo con Editar', () => {
    assert.equal(itemPuedeAsignarInsumo(linea, solEnviada, editar), true)
    assert.equal(itemPuedeAsignarInsumo(linea, solEnviada, validarGerencial), false)
    assert.equal(itemPuedeAsignarInsumo(linea, solEnviada, ambos), true)
    assert.equal(itemPuedeAsignarInsumo(linea, solEnviada, { ver: true }), false)
  })

  it('no asigna una línea ya aprobada ni una que ya está en la OC', () => {
    assert.equal(
      itemPuedeAsignarInsumo({ ...linea, estado_validacion: 'aprobado' }, solEnviada, editar),
      false,
    )
    assert.equal(
      itemPuedeAsignarInsumo(
        { ...linea, en_orden_compra: true },
        { estado: 'aprobada', tiene_orden_compra: true, orden_compra: { id: 1 } },
        editar,
      ),
      false,
    )
  })

  it('sí asigna una línea nueva post-OC que aún no entró a la orden', () => {
    const sol = { estado: 'aprobada', tiene_orden_compra: true, orden_compra: { id: 1 } }
    assert.equal(
      itemPuedeAsignarInsumo({ id: 2, en_orden_compra: false, estado_validacion: 'pendiente' }, sol, editar),
      true,
    )
  })

  it('la corrección post-OC no se amplía a quien solo tiene Editar', () => {
    const sol = {
      estado: 'aprobada',
      tiene_orden_compra: true,
      orden_compra: { id: 1, tiene_entradas: false },
    }
    const item = { id: 3, en_orden_compra: true, estado_validacion: 'aprobado' }
    assert.equal(itemPuedeCorregirInsumoPostOc(item, sol, editar), false)
    assert.equal(itemPuedeCorregirInsumoPostOc(item, sol, ambos), true)
    assert.equal(
      itemPuedeCorregirInsumoPostOc(item, { ...sol, orden_compra: { id: 1, tiene_entradas: true } }, ambos),
      false,
    )
  })

  it('aprobar la solicitud sigue exigiendo Validar y gerencial', () => {
    assert.equal(solicitudPuedeValidar(solEnviada, editar), false)
    assert.equal(solicitudPuedeValidar(solEnviada, { validar: true, esContratistaGerencial: false }), false)
    assert.equal(solicitudPuedeValidar(solEnviada, validarGerencial), true)
  })
})

describe('Fuentes — asignación separada de la aprobación', () => {
  it('helpers y modal distinguen Editar de Validar y ocultan cifras', () => {
    const helpers = readFileSync(join(dir, 'solicitudDetalleHelpers.js'), 'utf8')
    const abrir = helpers.slice(
      helpers.indexOf('export function puedeAbrirRevisionLinea'),
      helpers.indexOf('export function itemPuedeAsignarInsumo'),
    )
    assert.match(abrir, /permisos\?\.editar/)
    assert.match(abrir, /esContratistaGerencial/)
    const asignar = helpers.slice(
      helpers.indexOf('export function itemPuedeAsignarInsumo'),
      helpers.indexOf('export function labelPestañaInsumo'),
    )
    assert.match(asignar, /permisos\?\.editar/)
    assert.match(asignar, /en_orden_compra/)
    assert.match(asignar, /aprobado/)
    const post = helpers.slice(
      helpers.indexOf('export function itemPuedeCorregirInsumoPostOc'),
      helpers.indexOf('export function labelPestañaInsumo'),
    )
    assert.match(post, /esContratistaGerencial/)
    assert.match(post, /permisos\?\.editar/)
    assert.match(post, /tiene_entradas/)

    const modal = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    assert.match(modal, /itemPuedeAsignarInsumo/)
    assert.match(modal, /puedeEditarMapeo/)
    assert.match(modal, /Guardar mapeo/)
    assert.match(modal, /Aprobar ítem/)
    assert.match(modal, /Rechazar ítem/)
    assert.match(modal, /verEconomicos &&/)
    assert.match(modal, /Cobro, costo y rentabilidad|TablaRentabilidadAcumulada/)
    assert.match(modal, /verEconomicos && !\(costo > 0\)/)
    const antesDeAprobar = modal.slice(
      modal.indexOf('revision-linea-guardar-mapeo'),
      modal.indexOf('revision-linea-aprobar-item'),
    )
    assert.match(antesDeAprobar, /puedeValidarLinea &&/)
  })

  it('el detalle no muestra Aprobar y generar OC sin Validar', () => {
    const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    const idx = detalle.indexOf('Aprobar y generar OC')
    assert.ok(idx > 0)
    const around = detalle.slice(Math.max(0, idx - 700), idx)
    assert.match(around, /puedeValidar &&/)
    assert.match(detalle, /destacarSinInsumo=\{Boolean\(permisos\?\.editar\)\}/)
  })

  it('el backend exige editar para mapear y gerencial para aprobar', () => {
    const routes = readFileSync(join(dir, '../../../backend/almacen_routes.py'), 'utf8')
    const mapear = routes.slice(
      routes.indexOf('def route_mapear_item_gerencial'),
      routes.indexOf('def route_mapear_items_bloque'),
    )
    assert.match(mapear, /require_permiso_almacen\(current_user, "editar"\)/)
    assert.doesNotMatch(mapear, /require_contratista_gerencial_almacen/)
    const mapearBloque = routes.slice(
      routes.indexOf('def route_mapear_items_bloque'),
      routes.indexOf('def route_aprobar_items_bloque'),
    )
    assert.match(mapearBloque, /require_permiso_almacen\(current_user, "editar"\)/)
    assert.doesNotMatch(mapearBloque, /require_contratista_gerencial_almacen/)
    const validar = routes.slice(
      routes.indexOf('def route_validar_item_solicitud'),
      routes.indexOf('def route_aprobar_todos_items'),
    )
    assert.match(validar, /require_contratista_gerencial_almacen/)
    const aprobar = routes.slice(
      routes.indexOf('def route_aprobar_solicitud'),
      routes.indexOf('def route_mapear_item_gerencial'),
    )
    assert.match(aprobar, /require_contratista_gerencial_almacen/)
    const corregir = routes.slice(
      routes.indexOf('def route_corregir_insumo_post_oc'),
      routes.indexOf('def route_validar_item_solicitud'),
    )
    assert.match(corregir, /require_permiso_almacen\(current_user, "editar"\)/)
    assert.match(corregir, /es_contratista_gerencial/)
  })
})
