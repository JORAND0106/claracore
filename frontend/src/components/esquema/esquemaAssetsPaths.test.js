import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  esquemaAssetBlobPath,
  esquemaAssetFileName,
  esquemaAssetsFolderPrefix,
  slugEsquemaPathPart,
} from './esquemaAssetsPaths.js'

describe('esquemaAssetsPaths', () => {
  it('carpeta Contrato/Módulo/Reporte/Registro legible', () => {
    const p = esquemaAssetsFolderPrefix({
      contratoId: 42,
      modulo: 'Bitácora',
      reporteId: 7,
      reporteNombre: 'Entrada diaria',
      registroId: 15,
      registroNombre: 'Esquema excavación',
    })
    assert.match(p, /^esquemas\/42\//)
    assert.match(p, /Bitacora|Bit/)
    assert.match(p, /7-/)
    assert.match(p, /15-/)
  })

  it('nombres por tipo', () => {
    assert.match(esquemaAssetFileName('pdf', { title: 'Muro', stamp: 1 }), /\.pdf$/)
    assert.match(esquemaAssetFileName('dxf', { title: 'Muro', stamp: 1 }), /\.dxf$/)
    assert.match(esquemaAssetFileName('scene', { title: 'Muro', stamp: 1 }), /\.scene\.json$/)
    assert.match(esquemaAssetFileName('memoria', { title: 'Muro', stamp: 1 }), /^memoria_/)
  })

  it('blob path completo', () => {
    const path = esquemaAssetBlobPath(
      { contratoId: 1, modulo: 'sicoe', reporteId: 9, registroId: 3 },
      'dxf',
      { title: 'Tramo', stamp: 99 },
    )
    assert.match(path, /^esquemas\/1\/sicoe\/9\/3\//)
    assert.match(path, /\.dxf$/)
  })

  it('slug seguro', () => {
    assert.equal(slugEsquemaPathPart(''), 'sin-nombre')
    assert.ok(!slugEsquemaPathPart('a/b\\c').includes('/'))
  })
})
