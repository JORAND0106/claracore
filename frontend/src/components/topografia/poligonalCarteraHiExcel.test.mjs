/**
 * Regresión visual/estructural: HI en cartera + grillas Excel de armadas/captura.
 * No monta React completo; valida que el módulo exporta la columna HI y las COLS.
 *
 * node --test src/components/topografia/poligonalCarteraHiExcel.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const modalSrc = readFileSync(join(dir, 'PoligonalModal.jsx'), 'utf8')
const carteraSrc = readFileSync(join(dir, 'PoligonalCalculoTable.jsx'), 'utf8')

describe('Poligonal libreta — HI en cartera y armadas Excel', () => {
  it('cartera declara columna HI (m) y props de edición por armada', () => {
    assert.match(carteraSrc, /HI \(m\)/)
    assert.match(carteraSrc, /onUpdateHI/)
    assert.match(carteraSrc, /canEditHI/)
    assert.match(carteraSrc, /armadas/)
    assert.match(carteraSrc, /altura_instrumento/)
  })

  it('modal usa grillas Excel para armadas, agregar punto y nueva armada', () => {
    assert.match(modalSrc, /COLS_ARMADAS/)
    assert.match(modalSrc, /COLS_AGREGAR_PUNTO/)
    assert.match(modalSrc, /COLS_NUEVA_ARMADA/)
    assert.match(modalSrc, /title="Puntos de armada"/)
    assert.match(modalSrc, /title=\{editandoId \? 'Editar punto'/)
    assert.match(modalSrc, /title="Nueva armada"/)
  })

  it('HI ya no se edita en tarjetas aisladas de armada; sí en cartera y captura', () => {
    // El bloque de cards con HI inline desapareció
    assert.doesNotMatch(modalSrc, /Armada \{arm\.orden\}\{esActual \? ' ·actual'/)
    assert.match(modalSrc, /onUpdateHI=\{editableLibreta \? actualizarHIArmada/)
    assert.match(modalSrc, /HI armada/)
  })

  it('plano y cartera siguen montados en el flujo de estaciones', () => {
    assert.match(modalSrc, /<PoligonalGrafico/)
    assert.match(modalSrc, /<PoligonalCalculoTable/)
    assert.match(modalSrc, /Cartera consolidada/)
  })
})
