import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  agruparAprobadasPorOc,
  armarTarjetas,
  esMiPedido,
  lineasSeleccionadasPorSolicitud,
  solicitudesOrigen,
  solicitudesPropiasEditables,
} from './resumenProveedores.js'

const dir = dirname(fileURLToPath(import.meta.url))

const lineas = [
  {
    id: 1, solicitud_id: 40, consecutivo: 19, proveedor_id: 27, proveedor_nombre: 'SERVIPERFILES',
    estado_validacion: 'aprobado', cantidad: 10, valor: 100, numero_oc: 2,
    solicitado_por: 5, solicitud_created_by: 9, material_descripcion: 'Varilla', capitulo: '3',
  },
  {
    id: 2, solicitud_id: 40, consecutivo: 19, proveedor_id: 27, proveedor_nombre: 'SERVIPERFILES',
    estado_validacion: 'pendiente', cantidad: 4, valor: 40, solicitado_por: null, solicitud_created_by: 9,
    material_descripcion: 'Varilla pendiente',
  },
  {
    id: 3, solicitud_id: 41, consecutivo: 20, proveedor_id: 27, proveedor_nombre: 'SERVIPERFILES',
    estado_validacion: 'rechazado', cantidad: 1, valor: 8, motivo_rechazo: 'No alcanza',
    solicitado_por: 8, solicitud_created_by: 8,
  },
  {
    id: 4, solicitud_id: 32, consecutivo: 12, proveedor_id: 4, proveedor_nombre: 'Otra',
    estado_validacion: 'aprobado', cantidad: 2, valor: 20, numero_oc: null,
    solicitado_por: 5, solicitud_created_by: 5, material_descripcion: 'Cemento',
  },
]

describe('resumen por proveedor', () => {
  it('arma una tarjeta por proveedor y separa las tres cubetas', () => {
    const tarjetas = armarTarjetas(lineas, [
      { proveedor_id: 27, nombre: 'SERVIPERFILES CYS', contacto_email: 'a@b.co', contacto_nombre: 'Anyi', contacto_telefono: '320' },
    ], { verEconomicos: true })
    assert.equal(tarjetas.length, 2)
    const serv = tarjetas.find((t) => t.proveedorId === 27)
    assert.equal(serv.nombre, 'SERVIPERFILES CYS')
    assert.equal(serv.contacto_email, 'a@b.co')
    assert.equal(serv.contadores.aprobado.lineas, 1)
    assert.equal(serv.contadores.aprobado.valor, 100)
    assert.equal(serv.contadores.enviado.lineas, 1)
    assert.equal(serv.contadores.rechazado.lineas, 1)
    assert.equal(serv.enviados.length, 1)
    assert.equal(serv.aprobados[0].titulo, 'OC #2')
    assert.equal(serv.rechazados[0].motivo_rechazo, 'No alcanza')
  })

  it('las aprobadas sin OC quedan en un grupo aparte', () => {
    const grupos = agruparAprobadasPorOc([lineas[0], lineas[3]])
    assert.equal(grupos[0].titulo, 'OC #2')
    assert.equal(grupos[1].titulo, 'Aprobadas sin OC')
  })

  it('sin visibilidad económica los contadores no llevan valor', () => {
    const tarjetas = armarTarjetas(lineas, [], { verEconomicos: false })
    assert.equal(tarjetas[0].contadores.aprobado.valor, null)
    assert.equal(tarjetas[0].contadores.enviado.valor, null)
  })

  it('mis pedidos sigue la línea aunque la solicitud sea de otro', () => {
    assert.equal(esMiPedido(lineas[0], 5), true)
    assert.equal(esMiPedido(lineas[0], 9), false)
    assert.equal(esMiPedido(lineas[1], 9), true)
    const mias = armarTarjetas(lineas, [], { misPedidos: true, userId: 5, verEconomicos: true })
    const ids = mias.flatMap((t) => t.lineas.map((l) => l.id)).sort()
    assert.deepEqual(ids, [1, 4])
  })

  it('el buscador deja la línea en su proveedor', () => {
    const tarjetas = armarTarjetas(lineas, [], { q: 'cemento', verEconomicos: true })
    assert.equal(tarjetas.length, 1)
    assert.equal(tarjetas[0].lineas[0].solicitud_id, 32)
  })

  it('la OC se pide por solicitud, sin mezclar las líneas', () => {
    const grupos = lineasSeleccionadasPorSolicitud(lineas, [1, 2, 4])
    const porId = Object.fromEntries(grupos.map((g) => [g.solicitudId, g.itemIds]))
    assert.deepEqual(porId[40], [1, 2])
    assert.deepEqual(porId[32], [4])
  })

  it('elige la solicitud de origen y, para agregar, solo las editables del usuario', () => {
    const origen = solicitudesOrigen([
      { solicitud_id: 40, consecutivo: 19, estado_solicitud: 'enviada', numero_oc: null },
      { solicitud_id: 40, consecutivo: 19, estado_solicitud: 'enviada', numero_oc: 2 },
      { solicitud_id: 41, consecutivo: 20, estado_solicitud: 'aprobada' },
    ])
    assert.equal(origen.length, 2)
    assert.equal(origen[0].enOc, true)
    assert.equal(origen[0].estado, 'enviada')
    assert.equal(origen[1].estado, 'aprobada')
    const propias = solicitudesPropiasEditables([
      { id: 1, created_by: 5, estado: 'borrador', consecutivo: 3 },
      { id: 2, created_by: 5, estado: 'aprobada', consecutivo: 4 },
      { id: 3, created_by: 9, estado: 'enviada', consecutivo: 5 },
    ], 5)
    assert.deepEqual(propias.map((s) => s.id), [1])
  })

  it('la pestaña existe y Agrupar ya no está en la grilla', () => {
    const main = readFileSync(join(dir, 'AlmacenMain.jsx'), 'utf8')
    const panel = readFileSync(join(dir, 'SolicitudesPanel.jsx'), 'utf8')
    const resumen = readFileSync(join(dir, 'ResumenProveedoresPanel.jsx'), 'utf8')
    assert.match(main, /label: 'Resumen'/)
    assert.match(resumen, /data-testid="resumen-proveedor"/)
    assert.match(resumen, /data-testid="resumen-sin-insumo"/)
    assert.match(resumen, /data-testid="resumen-mis-pedidos"/)
    assert.match(resumen, /verEconomicos &&/)
    assert.doesNotMatch(panel, /data-testid="agrupar-solicitudes"/)
    assert.doesNotMatch(panel, /data-testid="deshacer-agrupar"/)
  })
})
