import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('poligonal biblioteca al terminar', () => {
  it('poligonalSellada solo mira nivel2 Aprobado', () => {
    const shared = readFileSync(join(__dirname, 'topografiaShared.jsx'), 'utf8')
    const start = shared.indexOf('export function poligonalSellada')
    const end = shared.indexOf('\nexport function', start + 1)
    const fn = shared.slice(start, end > 0 ? end : start + 400)
    assert.match(fn, /nivel2_estado/)
    assert.match(fn, /Aprobado/)
    assert.doesNotMatch(fn, /biblioteca_at/)
  })

  it('cerrar backend publica biblioteca', () => {
    const routes = readFileSync(
      join(__dirname, '../../../../backend/topografia_routes.py'),
      'utf8',
    )
    const start = routes.indexOf('def cerrar_poligonal')
    const end = routes.indexOf('\n@router.', start + 1)
    const block = routes.slice(start, end)
    assert.match(block, /_publicar_poligonal_en_biblioteca/)
    assert.match(block, /Puntos publicados en biblioteca/)
  })

  it('copy del modal ya no dice que biblioteca espera interventoría', () => {
    const modal = readFileSync(join(__dirname, 'PoligonalModal.jsx'), 'utf8')
    assert.match(modal, /publican en la biblioteca/)
    assert.doesNotMatch(
      modal,
      /biblioteca se publica cuando interventoría aprueba/,
    )
  })
})
