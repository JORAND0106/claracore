import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { medirVistaTablaOc, textoAlertaVistaTablaOc } from './entradaOcTablaVista.js'

describe('entradaOcTablaVista', () => {
  it('detecta filas ocultas y marcadas fuera de vista', () => {
    const scrollEl = { scrollTop: 40, clientHeight: 50 }
    const rows = [
      { offsetTop: 0, offsetHeight: 30, getAttribute: () => 'a' },
      { offsetTop: 30, offsetHeight: 30, getAttribute: () => 'b' },
      { offsetTop: 60, offsetHeight: 30, getAttribute: () => 'c' },
      { offsetTop: 90, offsetHeight: 30, getAttribute: () => 'd' },
    ]
    const r = medirVistaTablaOc(scrollEl, rows, new Set(['d', 'a']))
    assert.equal(r.total, 4)
    assert.equal(r.hayOcultas, true)
    assert.ok(r.visible < 4)
    assert.ok(r.marcadasOcultas >= 1)
    assert.match(textoAlertaVistaTablaOc(r), /insumos en vista/)
    assert.match(textoAlertaVistaTablaOc(r), /marcado/)
  })

  it('sin ocultas no muestra alerta', () => {
    assert.equal(textoAlertaVistaTablaOc({ hayOcultas: false, total: 3, visible: 3 }), '')
  })
})
