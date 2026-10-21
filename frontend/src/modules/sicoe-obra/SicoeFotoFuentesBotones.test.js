/**
 * C-DES-08 foto del cuadro: mismos orígenes que registros
 * (cámara / galería dispositivo / archivo) + control compartido.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fuentesSrc = readFileSync(join(here, 'SicoeFotoFuentesBotones.jsx'), 'utf8')
const modalSrc = readFileSync(join(here, 'SicoeCuadroAcerosModal.jsx'), 'utf8')

describe('SicoeFotoFuentesBotones · C-DES-08 foto cuadro', () => {
  it('expone los cuatro orígenes de foto en SICOE_FOTO_FUENTES', () => {
    assert.match(fuentesSrc, /'camara'/)
    assert.match(fuentesSrc, /'galeria-dispositivo'/)
    assert.match(fuentesSrc, /'archivo'/)
    assert.match(fuentesSrc, /'galeria-contrato'/)
    assert.match(fuentesSrc, /SICOE_FOTO_FUENTES/)
  })

  it('declara inputs de cámara (capture), galería y archivo (sin capture, multiple)', () => {
    const inputs = [...fuentesSrc.matchAll(/<input\b[\s\S]*?\/>/g)].map((m) => m[0])
    const cam = inputs.find((s) => s.includes('sicoe-foto-fuente-camara'))
    const gal = inputs.find((s) => s.includes('sicoe-foto-fuente-galeria'))
    const arch = inputs.find((s) => s.includes('sicoe-foto-fuente-archivo'))
    assert.ok(cam, 'input cámara')
    assert.ok(gal, 'input galería')
    assert.ok(arch, 'input archivo')
    assert.match(cam, /capture="environment"/)
    assert.doesNotMatch(gal, /capture=/)
    assert.doesNotMatch(arch, /capture=/)
    assert.equal((fuentesSrc.match(/capture=/g) || []).length, 1, 'un solo capture')
    assert.match(fuentesSrc, /multiple=\{!!multiple\}/)
  })

  it('el cuadro de aceros usa SicoeFotoFuentesBotones (no un solo input con capture)', () => {
    assert.match(modalSrc, /SicoeFotoFuentesBotones/)
    assert.match(modalSrc, /Foto compartida/)
    assert.match(modalSrc, /quitarFotoLocal|Quitar antes de cargar/)
    // No debe quedar el input monolítico con capture en el bloque de foto.
    assert.doesNotMatch(
      modalSrc,
      /Foto compartida[\s\S]{0,1200}capture="environment"/,
    )
    assert.equal(
      (modalSrc.match(/capture=/g) || []).length,
      0,
      'el modal del cuadro no fuerza capture en su propio markup',
    )
  })

  it('al editar, las mismas fuentes permiten reemplazar (onFiles acumula previews quitables)', () => {
    assert.match(modalSrc, /modo = 'crear'/)
    assert.match(modalSrc, /fotoInicial/)
    assert.match(modalSrc, /setFotoFiles/)
    assert.match(modalSrc, /URL\.createObjectURL/)
    assert.match(modalSrc, /quitarFotoLocal/)
  })
})
