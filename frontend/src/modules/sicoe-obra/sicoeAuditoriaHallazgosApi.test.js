/**
 * Tests de carga / mensajes de error del Ambiente de Auditoría.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mensajeErrorCarga } from './sicoeAuditoriaMensajes.js'
import { resumenAmbienteDesdeFilas } from './sicoeAuditoriaTraslapos.js'

describe('mensajeErrorCarga', () => {
  it('traduce Load failed / Failed to fetch a español claro', () => {
    assert.match(
      mensajeErrorCarga({ message: 'Load failed' }, 'fallback'),
      /No se pudieron cargar o sincronizar los hallazgos/,
    )
    assert.match(
      mensajeErrorCarga({ message: 'Failed to fetch' }, 'fallback'),
      /No se pudieron cargar o sincronizar los hallazgos/,
    )
  })

  it('no expone HTML de proxy', () => {
    const msg = mensajeErrorCarga(
      { message: '<!DOCTYPE html><html>502 Bad Gateway</html>' },
      'No se pudieron cargar los hallazgos.',
    )
    assert.equal(msg, 'No se pudieron cargar los hallazgos.')
  })

  it('conserva mensajes cortos útiles', () => {
    assert.equal(
      mensajeErrorCarga({ message: 'Tabla de hallazgos no disponible' }, 'fb'),
      'Tabla de hallazgos no disponible',
    )
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
