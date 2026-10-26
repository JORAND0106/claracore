/**
 * C-DES-08 + bug Android (Lenovo TB311FU):
 * un solo input con capture abre solo la cámara; SicoeObra debe
 * ofrecer botones separados (cámara / galería / archivo) en todos
 * los puntos de agregar o reemplazar fotos.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fuentesSrc = readFileSync(join(here, 'SicoeFotoFuentesBotones.jsx'), 'utf8')
const modalSrc = readFileSync(join(here, 'SicoeCuadroAcerosModal.jsx'), 'utf8')
const appSrc = readFileSync(join(here, '../../App.jsx'), 'utf8')

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
    // Solo el input de cámara lleva el atributo (el comentario del archivo también menciona capture=).
    assert.equal(
      (fuentesSrc.match(/\bcapture="environment"/g) || []).length,
      1,
      'un solo atributo capture en markup',
    )
    assert.match(fuentesSrc, /multiple=\{!!multiple\}/)
  })

  it('por defecto es solo icono con tooltip (title / aria-label) y modo add|replace', () => {
    assert.match(fuentesSrc, /iconOnly = true/)
    assert.match(fuentesSrc, /mode = 'add'/)
    assert.match(fuentesSrc, /Reemplazar con/)
    assert.match(fuentesSrc, /Tomar \/ elegir/)
    assert.match(fuentesSrc, /title=\{`\$\{verb\} la cámara`\}/)
    assert.match(fuentesSrc, /aria-label=\{`\$\{verb\} la cámara`\}/)
  })

  it('el cuadro de aceros usa SicoeFotoFuentesBotones (no un solo input con capture)', () => {
    assert.match(modalSrc, /SicoeFotoFuentesBotones/)
    assert.match(modalSrc, /Foto compartida/)
    assert.match(modalSrc, /quitarFotoLocal|Quitar antes de cargar/)
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

describe('SicoeObra App · fotos sin capture monolítico (Android chooser)', () => {
  it('importa y usa SicoeFotoFuentesBotones en hoja y modal nuevo reporte', () => {
    assert.match(appSrc, /import SicoeFotoFuentesBotones from '\.\/modules\/sicoe-obra\/SicoeFotoFuentesBotones\.jsx'/)
    assert.ok(
      (appSrc.match(/<SicoeFotoFuentesBotones\b/g) || []).length >= 4,
      'hoja (add/replace/empty) + modal nuevo reporte',
    )
  })

  it('no deja inputs de foto con capture="environment" fuera del componente de fuentes', () => {
    // Cualquier capture restante en App.jsx rompería de nuevo la tablet Lenovo.
    assert.equal(
      (appSrc.match(/capture=["']environment["']/g) || []).length,
      0,
      'App.jsx no debe forzar capture en fotos (ni en otros file inputs de Sicoe)',
    )
  })

  it('agregar y reemplazar en hoja pasan mode add|replace a subirFoto vía onFiles', () => {
    assert.match(appSrc, /onFiles=\{\(files\) => void subirFoto\(files, \{ mode: 'add' \}\)\}/)
    assert.match(appSrc, /onFiles=\{\(files\) => void subirFoto\(files\[0\], \{ mode: 'replace' \}\)\}/)
    assert.match(appSrc, /mode="replace"/)
  })

  it('modal FOTO OBRA usa fuentes (sin input file monolítico con capture)', () => {
    const fotoBlock = appSrc.match(/📸 FOTO OBRA \*[\s\S]{0,2500}/)
    assert.ok(fotoBlock, 'bloque FOTO OBRA')
    assert.match(fotoBlock[0], /SicoeFotoFuentesBotones/)
    assert.doesNotMatch(fotoBlock[0], /capture=/)
  })
})
