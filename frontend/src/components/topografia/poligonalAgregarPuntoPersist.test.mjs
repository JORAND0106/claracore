/**
 * Regresión estructural: «Agregar punto» no debe reiniciarse en cada sync de detalle.
 *
 * Causa raíz documentada: aplicarDetalle hacía setEstForm(resetEstForm()) siempre;
 * sincronizarDetalle (HI onBlur, onSaved→initialDetalle) borraba captura en curso.
 *
 * node --test src/components/topografia/poligonalAgregarPuntoPersist.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const modalSrc = readFileSync(join(dir, 'PoligonalModal.jsx'), 'utf8')

describe('PoligonalModal — aislamiento de estForm (Agregar punto)', () => {
  it('aplicarDetalle solo limpia captura cuando resetCaptura es true', () => {
    assert.match(modalSrc, /resetCaptura\s*=\s*false/)
    const aplicar = modalSrc.match(
      /const aplicarDetalle = useCallback\(\(data, id(?:, opts = \{\})?\) => \{([\s\S]*?)\}, \[\]\)/,
    )
    assert.ok(aplicar, 'aplicarDetalle localizable')
    const body = aplicar[1]
    assert.match(body, /const \{\s*resetCaptura\s*=\s*false\s*\}/)
    assert.match(body, /if\s*\(\s*resetCaptura\s*\)\s*\{[\s\S]*?setEstForm\(resetEstForm\(\)\)/)
    const withoutResetBlock = body.replace(/if\s*\(\s*resetCaptura\s*\)\s*\{[\s\S]*?\}/, '')
    assert.doesNotMatch(
      withoutResetBlock,
      /setEstForm\(resetEstForm\(\)\)/,
      'sin resetCaptura no debe reiniciar estForm',
    )
  })

  it('cargarDetalle propaga resetCaptura y por defecto no limpia captura', () => {
    assert.match(
      modalSrc,
      /const \{\s*silencioso\s*=\s*false,\s*resetCaptura\s*=\s*false\s*\}\s*=\s*opts/,
    )
    assert.match(modalSrc, /aplicarDetalle\(data, id, \{\s*resetCaptura\s*\}\)/)
  })

  it('hidratar desde initialDetalle solo al abrir/cambiar poligonal (no en cada refresh del padre)', () => {
    assert.match(modalSrc, /prevPoligonalIdRef/)
    assert.match(modalSrc, /const switched = prevPoligonalIdRef\.current !== initialPoligonalId/)
    assert.match(modalSrc, /if \(justOpened \|\| switched\)/)
    assert.match(modalSrc, /aplicarDetalle\(initialDetalle, initialPoligonalId, \{\s*resetCaptura:\s*true\s*\}\)/)
  })

  it('Cambiar armada limpia captura de forma explícita; sync de HI no depende de reset global', () => {
    assert.match(
      modalSrc,
      /setEstForm\(resetEstForm\(\)\)\s*\n\s*await sincronizarDetalle\('Armada creada\.'\)/,
    )
    assert.match(modalSrc, /Solo refresca cartera\/armadas; estForm/)
  })
})
