/**
 * Tests — dibujar nodos según tipo + unir por número vs tabla.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  accionDibujarNodosPorTipo,
  buildLineasSentidoEje,
  buildLineasUniendoNodos,
  buildNodosFromParsedCoords,
  mensajeNodoInexistente,
  parseCoordRowsForCanvas,
  resolveNodoPorNumero,
} from './esquemaApplyCoordRows.js'

describe('esquemaApplyCoordRows', () => {
  it('parsea filas y numera 1..n', () => {
    const parsed = parseCoordRowsForCanvas([
      { norte: 971988.373, este: 958213.494, desc: 'Inicio' },
      { norte: 971990.132, este: 958205.672, desc: 'Fin' },
    ])
    assert.equal(parsed.length, 2)
    assert.equal(parsed[0].num, '1')
    assert.equal(parsed[1].num, '2')
  })

  it('con tipo línea une nodos 1→2', () => {
    assert.deepEqual(accionDibujarNodosPorTipo('linea'), {
      unirEnOrden: true,
      abrirUnirPorNumero: false,
      preguntarSentidoEje: true,
    })
    const parsed = parseCoordRowsForCanvas([
      { norte: 100, este: 200 },
      { norte: 110, este: 200 },
    ])
    const { nodes } = buildNodosFromParsedCoords(parsed, { uid: (() => { let i = 0; return () => `id${++i}` })() })
    const lines = buildLineasUniendoNodos(nodes, { uid: (() => { let i = 0; return () => `l${++i}` })() })
    assert.equal(nodes.length, 2)
    assert.equal(lines.length, 1)
    assert.equal(lines[0].type, 'linea')
    assert.equal(lines[0].sentidoEje, false)
    assert.equal(lines[0].x1, nodes[0].x)
    assert.equal(lines[0].y1, nodes[0].y)
    assert.equal(lines[0].x2, nodes[1].x)
    assert.equal(lines[0].y2, nodes[1].y)
    // ΔN=+10 → world Y negativo (Norte arriba)
    assert.ok(nodes[1].y < nodes[0].y)
    assert.equal(nodes[1].x, nodes[0].x)
  })

  it('tipo polígono abre unir por número; nodo no une solo', () => {
    assert.equal(accionDibujarNodosPorTipo('poligono').abrirUnirPorNumero, true)
    assert.equal(accionDibujarNodosPorTipo('nodo').unirEnOrden, false)
    assert.equal(accionDibujarNodosPorTipo('nodo').abrirUnirPorNumero, false)
  })

  it('resolveNodoPorNumero halla en lienzo y en tabla', () => {
    const canvas = [{ type: 'nodo', nodeNum: '1', x: 0, y: 0 }]
    assert.equal(resolveNodoPorNumero('1', canvas, []).kind, 'canvas')
    assert.equal(resolveNodoPorNumero('2', canvas, [
      { num: '1', norte: 1, este: 2 },
      { num: '2', norte: 3, este: 4 },
    ]).kind, 'table')
    const miss = resolveNodoPorNumero('9', canvas, [{ num: '1', norte: 1, este: 2 }])
    assert.equal(miss.kind, 'missing')
    assert.match(mensajeNodoInexistente(9), /No existe el nodo «9»/)
  })

  it('segmento de la captura: ΔE oeste, ΔN norte (~8 m)', () => {
    const parsed = parseCoordRowsForCanvas([
      { norte: 971988.373, este: 958213.494 },
      { norte: 971990.132, este: 958205.672 },
    ])
    const { nodes } = buildNodosFromParsedCoords(parsed)
    const dX = nodes[1].x - nodes[0].x
    const dY = nodes[1].y - nodes[0].y
    // Este disminuye → x negativo; Norte aumenta → y negativo
    assert.ok(dX < 0)
    assert.ok(dY < 0)
    const lenMeters = Math.hypot(dX, dY) / 50
    assert.ok(Math.abs(lenMeters - 8.017) < 0.05, `len=${lenMeters}`)
  })

  it('buildLineasSentidoEje marca sentidoEje y cae a recta sin plano', () => {
    const parsed = parseCoordRowsForCanvas([
      { norte: 971988.373, este: 958213.494 },
      { norte: 971990.132, este: 958205.672 },
    ])
    const { origin, nodes } = buildNodosFromParsedCoords(parsed, {
      uid: (() => { let i = 0; return () => `n${++i}` })(),
    })
    const empty = buildLineasSentidoEje(nodes, { type: 'FeatureCollection', features: [] }, {
      origin,
      uid: (() => { let i = 0; return () => `e${++i}` })(),
    })
    assert.equal(empty.usedEje, false)
    assert.equal(empty.objects.length, 1)
    assert.equal(empty.objects[0].type, 'linea')
    assert.equal(empty.objects[0].sentidoEje, false)
  })

  it('buildLineasSentidoEje con ejes produce polilínea sentidoEje', async () => {
    const { gkBogotaToWgs84 } = await import('../../utils/epsg3116.js')
    const parsed = parseCoordRowsForCanvas([
      { norte: 1000000, este: 1000000 },
      { norte: 1000080, este: 1000010 },
    ])
    const { origin, nodes } = buildNodosFromParsedCoords(parsed, {
      uid: (() => { let i = 0; return () => `n${++i}` })(),
    })
    const a = gkBogotaToWgs84(nodes[0].este, nodes[0].norte)
    const b = gkBogotaToWgs84(nodes[1].este, nodes[1].norte)
    assert.ok(a && b)
    // Eje ligeramente al oeste de ambos puntos, con un quiebre.
    const ejes = [{
      id: 0,
      puntos: [
        { m: 0, lng: a.lng - 0.00005, lat: a.lat - 0.0002 },
        { m: 40, lng: a.lng - 0.00005, lat: (a.lat + b.lat) / 2 },
        { m: 80, lng: b.lng - 0.00004, lat: b.lat + 0.0002 },
      ],
    }]
    const built = buildLineasSentidoEje(nodes, null, {
      origin,
      ejes,
      uid: (() => { let i = 0; return () => `p${++i}` })(),
      stepM: 5,
    })
    assert.equal(built.usedEje, true)
    assert.equal(built.objects.length, 1)
    assert.equal(built.objects[0].type, 'polilinea')
    assert.equal(built.objects[0].sentidoEje, true)
    assert.ok(built.objects[0].points.length >= 3)
    assert.equal(built.objects[0].points[0].x, nodes[0].x)
    assert.equal(built.objects[0].points[0].y, nodes[0].y)
  })
})
