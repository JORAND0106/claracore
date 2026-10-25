import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  composeEsquemaDxf,
  originGkFromCoordRows,
  esquemaDxfToDataUri,
} from './esquemaExportDxf.js'
import { metersToWorld } from './esquemaGeometry.js'

describe('esquemaExportDxf', () => {
  it('DXF local en metros con capas', () => {
    const { dxf, georeferenced, layers } = composeEsquemaDxf({
      title: 'Local',
      objects: [
        { type: 'linea', x1: 0, y1: 0, x2: metersToWorld(2), y2: 0 },
        { type: 'texto', x: 10, y: 10, text: 'Hola', fontSize: 14 },
        { type: 'cota', x1: 0, y1: 0, x2: 50, y2: 0, label: '1.00' },
      ],
    })
    assert.equal(georeferenced, false)
    assert.match(dxf, /\$INSUNITS/)
    assert.match(dxf, /\n6\n/) // metros
    assert.match(dxf, /ESQUEMA_2D/)
    assert.match(dxf, /ESQUEMA_COTAS/)
    assert.match(dxf, /ESQUEMA_TEXTOS/)
    assert.match(dxf, /LINE/)
    assert.ok(layers.includes('ESQUEMA_2D'))
    const uri = esquemaDxfToDataUri(dxf)
    assert.match(uri, /^data:application\/dxf;base64,/)
  })

  it('DXF georreferenciado MAGNA-SIRGAS desde tabla', () => {
    const rows = [
      { num: 'Inicio', norte: 1045000.12, este: 980000.45 },
      { num: 'Fin', norte: 1045010.12, este: 980010.45 },
    ]
    assert.deepEqual(originGkFromCoordRows(rows), {
      norte0: 1045000.12,
      este0: 980000.45,
    })
    const { dxf, georeferenced } = composeEsquemaDxf({
      coordRows: rows,
      objects: [{ type: 'nodo', num: 'A', norte: 1045005, este: 980005, x: 0, y: 0 }],
    })
    assert.equal(georeferenced, true)
    assert.match(dxf, /1045000\.12/)
    assert.match(dxf, /980000\.45/)
    assert.match(dxf, /ESQUEMA_COORDS/)
    assert.match(dxf, /POINT/)
  })

  it('capa por ítem SicoeObra', () => {
    const { dxf, layers } = composeEsquemaDxf({
      itemCodigo: '01.02',
      objects: [{ type: 'linea', x1: 0, y1: 0, x2: 10, y2: 10 }],
    })
    assert.ok(layers.some((l) => l.startsWith('ITEM_')))
    assert.match(dxf, /ITEM_/)
  })
})
