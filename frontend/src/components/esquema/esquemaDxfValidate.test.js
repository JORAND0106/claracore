import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateEsquemaDxf } from './esquemaDxfValidate.js'
import {
  composeEsquemaDxf,
  dxfEncodeText,
  dxfNum,
} from './esquemaExportDxf.js'
import { metersToWorld } from './esquemaGeometry.js'

describe('esquemaDxfValidate + AutoCAD 2013', () => {
  it('dxfNum nunca emite NaN/Infinity', () => {
    assert.equal(dxfNum(NaN), 0)
    assert.equal(dxfNum(Infinity), 0)
    assert.equal(dxfNum(-Infinity), 0)
    assert.equal(dxfNum(1.23456789111), 1.23456789)
  })

  it('textos con tildes, ñ y símbolos usan \\U+XXXX', () => {
    const s = dxfEncodeText('Área Ø 12² · π · niño')
    assert.match(s, /\\U\+[0-9A-F]{4}/)
    assert.ok(!/[ÁñØ²π]/.test(s) || s.includes('\\U+'))
  })

  it('composeEsquemaDxf produce DXF AC1027 que pasa el verificador', () => {
    const { dxf, validation, acadver } = composeEsquemaDxf({
      title: 'Prueba AutoCAD',
      objects: [
        { type: 'linea', x1: 0, y1: 0, x2: metersToWorld(2), y2: 0 },
        { type: 'texto', x: 10, y: 10, text: 'Excavación Ø12²', fontSize: 14 },
        { type: 'cota', x1: 0, y1: 0, x2: 50, y2: 0, label: '1,00 m' },
      ],
      solids3d: [{
        id: 's1',
        cells: [{
          ring: [
            { x: 0, y: 0 },
            { x: metersToWorld(1), y: 0 },
            { x: metersToWorld(1), y: metersToWorld(1) },
            { x: 0, y: metersToWorld(1) },
          ],
          z0: 100,
          z1: 102.5,
        }],
      }],
      coordRows: [
        { num: 'P1', norte: 1045000.12, este: 980000.45, cota: 101.2 },
      ],
    })
    assert.equal(acadver, 'AC1027')
    assert.match(dxf, /\$ACADVER/)
    assert.match(dxf, /AC1027/)
    assert.match(dxf, /\n2\nLTYPE\n/)
    assert.match(dxf, /\n2\nSTYLE\n/)
    assert.match(dxf, /CONTINUOUS/)
    assert.match(dxf, /STANDARD/)
    assert.match(dxf, /3DFACE/)
    assert.match(dxf, /\\U\+/)
    assert.equal(validation.ok, true, validation.errors?.join('; '))
    const v2 = validateEsquemaDxf(dxf)
    assert.equal(v2.ok, true, v2.errors.join('; '))
  })

  it('rechaza DXF vacío o sin EOF', () => {
    assert.equal(validateEsquemaDxf('').ok, false)
    assert.equal(validateEsquemaDxf('0\nSECTION\n').ok, false)
  })
})
