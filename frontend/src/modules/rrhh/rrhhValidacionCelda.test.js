/**
 * Node tests — celda Validación (estado + color auditoría) en grilla RRHH.
 * Run: node --test src/modules/rrhh/rrhhValidacionCelda.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  auditoriaEjecutada,
  coloresAuditoriaCelda,
  estiloCeldaValidacion,
  labelEstadoValidacion,
  normalizarEstadoValidacion,
  patchFilaValidacionAuditoria,
  tonoAuditoriaCelda,
} from './rrhhValidacionCelda.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('rrhhValidacionCelda — estado', () => {
  it('normaliza y etiqueta Aprobado/Pendiente/Rechazado', () => {
    assert.equal(normalizarEstadoValidacion('APROBADO'), 'aprobado')
    assert.equal(normalizarEstadoValidacion(null), 'pendiente')
    assert.equal(labelEstadoValidacion('rechazado'), 'Rechazado')
    assert.equal(labelEstadoValidacion(''), 'Pendiente')
  })
})

describe('rrhhValidacionCelda — auditoría', () => {
  it('sin auditoría → tono ninguna', () => {
    assert.equal(auditoriaEjecutada({}), false)
    assert.equal(tonoAuditoriaCelda({ doc_validacion_estado: 'pendiente' }), 'ninguna')
  })

  it('auditoría ok → verde (ok)', () => {
    const row = { doc_auditoria_en: '2026-10-15T12:00:00Z', doc_auditoria_ok: true }
    assert.equal(auditoriaEjecutada(row), true)
    assert.equal(tonoAuditoriaCelda(row), 'ok')
  })

  it('auditoría con hallazgos → amarillo (hallazgos)', () => {
    const row = {
      doc_auditoria_informe_id: 9,
      doc_auditoria_ok: false,
    }
    assert.equal(auditoriaEjecutada(row), true)
    assert.equal(tonoAuditoriaCelda(row), 'hallazgos')
  })

  it('coincide con panel: ejecutada si hay en o informe_id', () => {
    assert.equal(auditoriaEjecutada({ doc_auditoria_en: 'x' }), true)
    assert.equal(auditoriaEjecutada({ doc_auditoria_informe_id: 1 }), true)
    assert.equal(auditoriaEjecutada({ doc_auditoria_ok: false }), false)
  })
})

describe('rrhhValidacionCelda — colores por tema', () => {
  it('ok usa success; hallazgos usa warn; ninguna sin fondo', () => {
    const ui = { warnBg: '#FFFBEB', warnText: '#D97706' }
    const ok = coloresAuditoriaCelda('ok', 'light', ui)
    assert.match(String(ok.background), /success|047857|34,197,94/)
    assert.match(String(ok.color), /success|047857/)

    const hall = coloresAuditoriaCelda('hallazgos', 'light', ui)
    assert.equal(hall.background, '#FFFBEB')
    assert.equal(hall.color, '#D97706')

    const none = coloresAuditoriaCelda('ninguna', 'dark', ui)
    assert.equal(none.background, 'transparent')
  })

  it('estiloCeldaValidacion combina etiqueta + título + fondo', () => {
    const celda = estiloCeldaValidacion(
      {
        doc_validacion_estado: 'aprobado',
        doc_auditoria_en: '2026-01-01',
        doc_auditoria_ok: true,
      },
      'light',
      { warnBg: '#FFFBEB', warnText: '#D97706' },
      { color: '#0f172a', padding: '6px 8px' },
    )
    assert.equal(celda.label, 'Aprobado')
    assert.equal(celda.tono, 'ok')
    assert.match(celda.title, /sin observaciones/i)
    assert.notEqual(celda.style.background, 'transparent')
    assert.equal(celda.style.fontWeight, 700)
  })

  it('sin tono de auditoría (flag off) solo muestra estado', () => {
    const celda = estiloCeldaValidacion(
      {
        doc_validacion_estado: 'aprobado',
        doc_auditoria_en: '2026-01-01',
        doc_auditoria_ok: true,
      },
      'light',
      { warnBg: '#FFFBEB', warnText: '#D97706' },
      {},
      { mostrarTonoAuditoria: false },
    )
    assert.equal(celda.label, 'Aprobado')
    assert.equal(celda.tono, 'ninguna')
    assert.equal(celda.style.background, 'transparent')
    assert.equal(celda.title, 'Validación: Aprobado')
  })

  it('sin auditoría no resalta aunque esté Pendiente', () => {
    const celda = estiloCeldaValidacion(
      { doc_validacion_estado: 'pendiente' },
      'rest',
      { warnBg: '#FEF3C7', warnText: '#92400E' },
      {},
    )
    assert.equal(celda.label, 'Pendiente')
    assert.equal(celda.tono, 'ninguna')
    assert.equal(celda.style.background, 'transparent')
    assert.match(celda.title, /Sin auditoría/i)
  })
})

describe('rrhhValidacionCelda — patch fila', () => {
  it('propaga campos de validación y auditoría', () => {
    const p = patchFilaValidacionAuditoria({
      id: 1,
      doc_validacion_estado: 'aprobado',
      doc_auditoria_ok: true,
      doc_auditoria_en: 't',
      nombres: 'X',
    })
    assert.equal(p.doc_validacion_estado, 'aprobado')
    assert.equal(p.doc_auditoria_ok, true)
    assert.equal(p.nombres, undefined)
  })
})

describe('rrhhValidacionCelda — grilla', () => {
  it('ModuloRrhh monta columna Validación y sincroniza al actualizar', () => {
    const src = readFileSync(join(dir, 'ModuloRrhh.jsx'), 'utf8')
    assert.match(src, /Validación/)
    assert.match(src, /estiloCeldaValidacion/)
    assert.match(src, /patchFilaValidacionAuditoria/)
    assert.match(src, /colSpan=\{canValidarMasivo \? 8 : 7\}/)
  })
})
