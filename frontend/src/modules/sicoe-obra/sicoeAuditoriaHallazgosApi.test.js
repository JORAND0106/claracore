/**
 * Tests de carga / mensajes de error del Ambiente de Auditoría.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mensajeErrorCarga, fmtFechaHallazgosGuardados } from './sicoeAuditoriaMensajes.js'
import { resumenAmbienteDesdeFilas } from './sicoeAuditoriaTraslapos.js'

describe('mensajeErrorCarga', () => {
  it('traduce Load failed / Failed to fetch sin culpar la conexión local', () => {
    const carga = mensajeErrorCarga({ message: 'Load failed' }, 'fallback')
    assert.match(carga, /servidor no respondió a tiempo|cortó la petición/i)
    assert.doesNotMatch(carga, /compruebe la conexión|compruebe la red/i)

    const sync = mensajeErrorCarga(
      { message: 'Failed to fetch' },
      'No se pudo sincronizar el análisis de hallazgos.',
      { context: 'sync' },
    )
    assert.match(sync, /sincronización|sincronizar/i)
    assert.match(sync, /servidor no respondió a tiempo|cortó la petición/i)
    assert.doesNotMatch(sync, /compruebe la conexión/i)
  })

  it('distingue timeout/gateway de HTML genérico', () => {
    const msg = mensajeErrorCarga(
      { message: '<!DOCTYPE html><html>502 Bad Gateway</html>' },
      'No se pudieron cargar los hallazgos.',
    )
    assert.match(msg, /tardó demasiado|servidor cortó/i)
  })

  it('solo menciona conexión ante falla real de red', () => {
    assert.match(
      mensajeErrorCarga({ message: 'NetworkError when attempting to fetch resource.' }, 'fb'),
      /conexión|red/i,
    )
    assert.match(
      mensajeErrorCarga({ message: 'Failed to connect' }, 'fb'),
      /conexión|red/i,
    )
  })

  it('conserva mensajes cortos útiles', () => {
    assert.equal(
      mensajeErrorCarga({ message: 'Tabla de hallazgos no disponible' }, 'fb'),
      'Tabla de hallazgos no disponible',
    )
  })

  it('explica 401/403 y 500 de forma clara', () => {
    assert.match(
      mensajeErrorCarga({ message: 'forbidden' }, 'fb', { status: 403 }),
      /permiso/i,
    )
    assert.match(
      mensajeErrorCarga({ message: 'Error 500' }, 'fb', { status: 500, context: 'sync' }),
      /servidor no pudo completar/i,
    )
    assert.equal(
      mensajeErrorCarga({ message: 'Falta migración SQL de hallazgos' }, 'fb', { status: 500 }),
      'Falta migración SQL de hallazgos',
    )
  })
})

describe('fmtFechaHallazgosGuardados', () => {
  it('formatea ISO a fecha/hora legible o null', () => {
    assert.equal(fmtFechaHallazgosGuardados(null), null)
    assert.equal(fmtFechaHallazgosGuardados(''), null)
    const s = fmtFechaHallazgosGuardados('2026-10-04T18:30:00.000Z')
    assert.ok(s)
    assert.match(s, /2026/)
  })
})

describe('resumenAmbienteDesdeFilas', () => {
  it('cuenta traslapos y vacíos pendientes', () => {
    const r = resumenAmbienteDesdeFilas([
      { tipo: 'traslapo', estado: 'pendiente', valor_en_juego: 1000 },
      { tipo: 'vacio', estado: 'pendiente', valor_en_juego: 0 },
      { tipo: 'traslapo', estado: 'justificado', valor_en_juego: 500 },
      { tipo: 'traslapo', estado: 'corregido', valor_en_juego: 999 },
    ])
    assert.equal(r.traslapos_sin_justificar.cantidad, 1)
    assert.equal(r.traslapos_sin_justificar.valor, 1000)
    assert.equal(r.vacios_sin_justificar.cantidad, 1)
    assert.equal(r.justificados.cantidad, 1)
  })

  it('lista vacía da ceros (solo válido tras carga OK)', () => {
    const r = resumenAmbienteDesdeFilas([])
    assert.equal(r.traslapos_sin_justificar.cantidad, 0)
    assert.equal(r.vacios_sin_justificar.cantidad, 0)
  })
})
