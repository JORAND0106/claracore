import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  inicialesDeNombre,
  ultimaValidacionRegistro,
  etiquetaNivelIniciales,
  colorDeEstadoValidacion,
  fraseEstadoRegistro,
  mostrarSemaforoValidacion,
  fotoMiniaturaRegistro,
  idRegistroSiguiente,
  idRegistroAnterior,
  indiceRegistroEnLista,
  mapaUsuariosPorId,
  ESTADOS_CONVENCION_VENTANA,
  SICOE_ACORDEON_FUNCIONES_REQUERIDAS,
} from './sicoeItemRegistrosVentanaHelpers.js'

describe('sicoeItemRegistrosVentanaHelpers', () => {
  it('inicialesDeNombre: nombre y apellido', () => {
    assert.equal(inicialesDeNombre('Luis', 'López'), 'LL')
    assert.equal(inicialesDeNombre('Ana María', 'Ruiz'), 'AR')
    assert.equal(inicialesDeNombre('Solo'), 'SO')
    assert.equal(inicialesDeNombre(''), '')
  })

  it('ultimaValidacionRegistro: elige por fecha más reciente', () => {
    const reg = {
      nivel1_estado: 'Aprobado',
      nivel1_usuario_id: 1,
      nivel1_fecha: '2024-01-01T10:00:00Z',
      nivel2_estado: 'Pendiente',
      nivel2_usuario_id: 2,
      nivel2_fecha: '2024-06-01T10:00:00Z',
      nivel3_estado: 'No Revisado',
    }
    const uv = ultimaValidacionRegistro(reg, [1, 2, 3])
    assert.equal(uv.nivel, 2)
    assert.equal(uv.estado, 'Pendiente')
    assert.equal(uv.etiqueta, 'N2')
    assert.equal(uv.usuarioId, 2)
  })

  it('ultimaValidacionRegistro: sin revisiones → No Revisado', () => {
    const uv = ultimaValidacionRegistro({}, [1, 2, 3])
    assert.equal(uv.estado, 'No Revisado')
    assert.equal(uv.etiqueta, '—')
  })

  it('etiquetaNivelIniciales: N2 · LL', () => {
    const uv = { etiqueta: 'N2', estado: 'Aprobado', usuarioId: 7 }
    const map = mapaUsuariosPorId([{ id: 7, nombre: 'Luis', apellidos: 'López' }])
    assert.equal(etiquetaNivelIniciales(uv, map), 'N2 · LL')
    assert.equal(etiquetaNivelIniciales(uv, {}), 'N2')
  })

  it('fraseEstadoRegistro: Aprobado por N4 · OL', () => {
    const uv = { etiqueta: 'N4', estado: 'Aprobado', usuarioId: 3 }
    const map = mapaUsuariosPorId([{ id: 3, nombre: 'Olga', apellidos: 'Luna' }])
    const f = fraseEstadoRegistro(uv, map)
    assert.equal(f.estado, 'Aprobado')
    assert.equal(f.sufijo, ' por N4 · OL')
    assert.equal(mostrarSemaforoValidacion('Aprobado'), false)
    assert.equal(mostrarSemaforoValidacion('Pendiente'), true)
    assert.equal(mostrarSemaforoValidacion('No Revisado'), true)
  })

  it('colorDeEstadoValidacion y convención mínima', () => {
    assert.equal(colorDeEstadoValidacion('Aprobado'), '#10B981')
    assert.equal(colorDeEstadoValidacion('Pendiente'), '#F59E0B')
    assert.equal(ESTADOS_CONVENCION_VENTANA.length, 4)
  })

  it('fotoMiniaturaRegistro y navegación siguiente/anterior', () => {
    assert.equal(fotoMiniaturaRegistro({ foto_url: 'https://x/a.jpg' }), 'https://x/a.jpg')
    const regs = [{ id: 10 }, { id: 20 }, { id: 30 }]
    assert.equal(indiceRegistroEnLista(regs, 20), 1)
    assert.equal(idRegistroSiguiente(regs, 20), 30)
    assert.equal(idRegistroSiguiente(regs, 30), null)
    assert.equal(idRegistroAnterior(regs, 20), 10)
    assert.equal(idRegistroAnterior(regs, 10), null)
  })

  it('inventario de funciones del acordeón está completo (paso 13)', () => {
    const must = [
      'ver_editar_datos_registro',
      'validar_por_nivel_segun_permisos',
      'objeto_pago_subcontratista',
      'fotos',
      'graficos_esquema',
      'galerias',
      'trazabilidad',
      'comentarios',
      'permisos_sellado_visibilidad_valores',
    ]
    for (const k of must) {
      assert.ok(SICOE_ACORDEON_FUNCIONES_REQUERIDAS.includes(k), k)
    }
  })
})
