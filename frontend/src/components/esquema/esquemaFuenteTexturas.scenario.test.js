/**
 * C-TX-13 / C-3D-18 · fuente sincronizada + texturas + vista realista.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLARA_FONT_KEYS } from '../../typographyScale.js'
import {
  SOLID_TEXTURE_CATALOG,
  SOLID_TEXTURE_NONE,
  normalizeSolidTextureId,
  solidTextureById,
} from './esquema3dTextures.js'
import { mapLegacyFontPxToCc, ESQUEMA_UI_FS } from './esquemaUiTypography.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function read(rel) {
  return readFileSync(join(__dirname, rel), 'utf8')
}

describe('caso · fuente UI sincronizada + texturas', () => {
  it('UI esquema usa var(--cc-*) y botón vista realista', () => {
    const modal = read('EsquemaEditorModal.jsx')
    assert.match(modal, /esquemaIconBtnStyle/)
    assert.match(modal, /var\(--cc-caption\)/)
    assert.match(modal, /esquema-vista-realista/)
    assert.match(modal, /Vista realista|Vista técnica/)
    assert.match(modal, /esquema-solid-texture/)
    assert.match(modal, /texturesEnabled/)
    assert.match(modal, /applySolidTexture/)
    const pipe = read('esquema3dPipeUi.jsx')
    assert.match(pipe, /var\(--cc-/)
    const md = read('CONTRATO_ESQUEMA.md')
    assert.match(md, /C-TX-13/)
    assert.match(md, /C-3D-18/)
    assert.match(md, /caso 56|56\./)
    assert.match(md, /caso 57|57\./)
  })

  it('plataforma tiene 3 niveles; catálogo de texturas completo', () => {
    assert.deepEqual([...CLARA_FONT_KEYS], ['pequena', 'normal', 'grande'])
    const ids = SOLID_TEXTURE_CATALOG.map((t) => t.id)
    assert.deepEqual(ids, [
      SOLID_TEXTURE_NONE, 'concreto', 'cesped', 'piedra', 'ladrillo',
      'asfalto', 'tierra', 'grava', 'agua',
    ])
    assert.equal(normalizeSolidTextureId('concreto'), 'concreto')
    assert.equal(normalizeSolidTextureId('none'), null)
    assert.equal(solidTextureById('piedra').label, 'Piedra')
    assert.equal(mapLegacyFontPxToCc(9), ESQUEMA_UI_FS.micro)
    assert.equal(mapLegacyFontPxToCc(18), ESQUEMA_UI_FS.md)
  })

  it('render y export respetan texturas / vista técnica', () => {
    const solids = read('esquema3dSolids.js')
    assert.match(solids, /solidFaceFillStyle/)
    assert.match(solids, /texturesEnabled/)
    assert.match(solids, /resolveSolidTextureFillStyle/)
    const exp = read('esquemaExport.js')
    assert.match(exp, /texturesEnabled:\s*true/)
    const calcExp = read('esquema3dCalcExport.js')
    assert.match(calcExp, /texturesEnabled:\s*true/)
    assert.match(calcExp, /drawSolidTextureSwatch/)
    const calc = read('esquema3dCalc.js')
    assert.match(calc, /textureId/)
  })

  it('test:esquema cablea tipografía y texturas', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaUiTypography\.test\.js/)
    assert.match(pkg.scripts['test:esquema'], /esquemaFuenteTexturas\.scenario\.test\.js/)
    assert.match(pkg.scripts['test:esquema'], /esquema3dTextures\.test\.js/)
  })
})
