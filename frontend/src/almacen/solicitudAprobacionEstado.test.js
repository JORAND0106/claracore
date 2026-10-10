/**
 * Aprobar depende de Validar y del estado, no del rol gerencial.
 * node --test frontend/src/almacen/solicitudAprobacionEstado.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

function solicitudTieneOrdenCompra(sol) {
  if (sol?.tiene_orden_compra) return true
  return Boolean(sol?.orden_compra?.id)
}

function solicitudTieneLineasPendientesPostOc(sol) {
  if (!solicitudTieneOrdenCompra(sol)) return false
  return (sol?.items || []).some((it) => !it?.en_orden_compra && (it?.estado_validacion || 'pendiente') !== 'rechazado')
}

function solicitudPuedeValidar(sol, permisos) {
  if (!permisos?.validar) return false
  if (sol?.estado === 'enviada' && !solicitudTieneOrdenCompra(sol)) return true
  if (sol?.estado === 'aprobada' && !solicitudTieneOrdenCompra(sol)) return true
  if (sol?.estado === 'aprobada' && solicitudTieneOrdenCompra(sol) && solicitudTieneLineasPendientesPostOc(sol)) return true
  return false
}

function motivoAprobacionNoDisponible(sol, permisos) {
  if (!permisos?.validar || !sol) return ''
  if (solicitudPuedeValidar(sol, permisos)) return ''
  const estado = String(sol.estado || '')
  if (estado === 'borrador' || estado === '') return 'borrador'
  if (estado === 'rechazada') return 'rechazada'
  if (estado === 'aprobada' && solicitudTieneOrdenCompra(sol)) return 'orden de compra'
  if (estado === 'aprobada') return 'aprobada'
  return 'estado'
}

function motivoEnvioNoDisponible(sol, permisos) {
  if (!permisos?.crear && !permisos?.editar) return ''
  if (!sol?.id) return ''
  if (sol.estado === 'enviada') return 'ya fue enviada'
  if (sol.estado === 'aprobada') return 'ya fue aprobada'
  if (!sol.estado || sol.estado === 'borrador' || sol.estado === 'rechazada') return ''
  return 'estado'
}

function itemPuedeValidar(item, sol, permisos) {
  return Boolean(
    solicitudPuedeValidar(sol, permisos)
    && item?.id
    && !item?.en_orden_compra
    && (item?.estado_validacion || 'pendiente') !== 'aprobado',
  )
}

function motivoItemNoValidable(item, sol, permisos) {
  if (!permisos?.validar) return ''
  if (itemPuedeValidar(item, sol, permisos)) return ''
  const deSolicitud = motivoAprobacionNoDisponible(sol, permisos)
  if (deSolicitud) return deSolicitud
  if (item?.en_orden_compra) return 'orden de compra'
  return 'estado'
}

function puedeAbrirRevisionLinea(permisos) {
  return Boolean(permisos?.editar || permisos?.validar || permisos?.esContratistaGerencial)
}

function resumenProveedoresSolicitud(items) {
  const keys = new Set()
  const proveedores = []
  let lineasSinInsumo = 0
  for (const it of items || []) {
    const sinInsumo = Boolean(it?.sin_insumo) || (!it?.insumo_id && !it?.es_recurrente)
    if (sinInsumo) {
      lineasSinInsumo += 1
      continue
    }
    const nombre = it?.es_recurrente ? 'Compra recurrente' : (it?.proveedor_nombre || it?.proveedor_catalogo || 'Proveedor')
    const key = String(it?.proveedor_id ?? nombre)
    if (keys.has(key)) continue
    keys.add(key)
    proveedores.push(nombre)
  }
  return { proveedores, ocs_previstas: proveedores.length, lineas_sin_insumo: lineasSinInsumo }
}

function etiquetaProveedorLinea(item) {
  if (item?.es_recurrente) return 'Compra recurrente'
  if (item?.sin_insumo || (!item?.insumo_id && !item?.es_recurrente)) return 'Sin insumo asignado'
  return item?.proveedor_nombre || item?.proveedor_catalogo || 'Proveedor'
}

const dir = dirname(fileURLToPath(import.meta.url))
const enviada = { id: 1, estado: 'enviada' }
const validar = { validar: true, esContratistaGerencial: false }
const admin = { validar: true, ver: true, crear: true }

describe('aprobación con Validar, sin rol gerencial', () => {
  it('un administrador con Validar aprueba una solicitud enviada', () => {
    assert.equal(solicitudPuedeValidar(enviada, validar), true)
    assert.equal(solicitudPuedeValidar(enviada, admin), true)
    assert.equal(solicitudPuedeValidar(enviada, { ver: true, crear: true }), false)
    assert.equal(puedeAbrirRevisionLinea(validar), true)
    assert.equal(motivoAprobacionNoDisponible(enviada, validar), '')
  })

  it('explica por qué no se puede aprobar un borrador o una solicitud ya aprobada', () => {
    const borrador = { id: 2, estado: 'borrador' }
    const aprobada = {
      id: 3,
      estado: 'aprobada',
      tiene_orden_compra: true,
      orden_compra: { id: 9 },
      items: [{ id: 1, en_orden_compra: true, estado_validacion: 'aprobado' }],
    }
    assert.match(motivoAprobacionNoDisponible(borrador, validar), /borrador/i)
    assert.match(motivoAprobacionNoDisponible(aprobada, validar), /orden de compra/i)
    const aprobadaSinOc = { id: 4, estado: 'aprobada', tiene_orden_compra: false, orden_compra: null }
    assert.equal(solicitudPuedeValidar(aprobadaSinOc, validar), true)
    assert.equal(motivoAprobacionNoDisponible(aprobadaSinOc, validar), '')
    assert.equal(motivoAprobacionNoDisponible(borrador, { ver: true }), '')
    assert.match(motivoEnvioNoDisponible(enviada, { crear: true }), /ya fue enviada/i)
    assert.equal(motivoEnvioNoDisponible(borrador, { crear: true }), '')
  })

  it('explica la línea ya aprobada o ya incluida en la OC', () => {
    const item = { id: 4, en_orden_compra: true, estado_validacion: 'aprobado' }
    assert.match(motivoItemNoValidable(item, enviada, validar), /orden de compra/i)
    assert.equal(motivoItemNoValidable({ id: 5, estado_validacion: 'pendiente' }, enviada, validar), '')
  })
})

describe('proveedor por línea', () => {
  it('separa proveedores y marca las líneas sin insumo', () => {
    const items = [
      { insumo_id: 1, proveedor_id: 10, proveedor_nombre: 'Ferretería Norte' },
      { insumo_id: 2, proveedor_id: 10, proveedor_nombre: 'Ferretería Norte' },
      { insumo_id: 3, proveedor_id: 11, proveedor_nombre: 'Aceros del Sur' },
      { sin_insumo: true },
      { es_recurrente: true, proveedor_nombre: 'Compra recurrente' },
    ]
    const resumen = resumenProveedoresSolicitud(items)
    assert.deepEqual(resumen.proveedores, ['Ferretería Norte', 'Aceros del Sur', 'Compra recurrente'])
    assert.equal(resumen.ocs_previstas, 3)
    assert.equal(resumen.lineas_sin_insumo, 1)
    assert.equal(etiquetaProveedorLinea({ sin_insumo: true }), 'Sin insumo asignado')
    assert.equal(etiquetaProveedorLinea(items[0]), 'Ferretería Norte')
  })
})

describe('el popup cablea la cadena de estados y el buzón', () => {
  it('el detalle muestra motivos, solicitar aprobación, proveedor y mensajes', () => {
    const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    const tabla = readFileSync(join(dir, 'SolicitudMaterialesExcelTable.jsx'), 'utf8')
    const buzon = readFileSync(join(dir, 'SolicitudBuzon.jsx'), 'utf8')
    const panel = readFileSync(join(dir, 'SolicitudesPanel.jsx'), 'utf8')
    assert.match(detalle, /detalle-solicitar-aprobacion/)
    assert.match(detalle, /motivo-aprobacion-no-disponible/)
    assert.match(detalle, /motivo-envio-no-disponible/)
    assert.match(detalle, /SolicitudBuzon/)
    assert.match(detalle, /solicitud-resumen-proveedores/)
    assert.match(tabla, /etiquetaProveedorLinea/)
    const helpers = readFileSync(join(dir, 'solicitudDetalleHelpers.js'), 'utf8')
    assert.match(helpers, /if \(!permisos\?\.validar\) return false/)
    assert.doesNotMatch(
      helpers.slice(helpers.indexOf('export function solicitudPuedeValidar'), helpers.indexOf('export function motivoAprobacionNoDisponible')),
      /esContratistaGerencial/,
    )
    assert.match(tabla, /Justificación/)
    assert.match(buzon, /Buscar por nombre o cargo/)
    assert.match(buzon, /puedeEnviar && disponible/)
    assert.match(panel, /solicitud-lista-no-leidos/)
  })
})
