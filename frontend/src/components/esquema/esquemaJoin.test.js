import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildJoinPolygonDraft,
  finalizeJoinSequence,
  joinIntersectingLines,
  materializeJoinAsClosedPolygon,
  segmentIntersection,
} from './esquemaJoin.js'
import { validarEscenaPorTipo } from '../../modules/sicoe-obra/sicoeDibujoTipos.js'

describe('esquemaJoin', () => {
  it('detects a real crossing and leaves disjoint lines untouched', () => {
    const cross = segmentIntersection(
      { x: 0, y: 10 }, { x: 20, y: 10 },
      { x: 10, y: 0 }, { x: 10, y: 20 },
    )
    assert.ok(cross)
    assert.equal(Math.round(cross.x), 10)
    assert.equal(Math.round(cross.y), 10)
    assert.equal(segmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 0, y: 20 }, { x: 10, y: 20 },
    ), null)
  })

  it('joins an L at the shared endpoint into one polyline', () => {
    const out = joinIntersectingLines([
      { id: 'a', type: 'linea', x1: 0, y1: 0, x2: 40, y2: 0, color: '#111' },
      { id: 'b', type: 'linea', x1: 40, y1: 0, x2: 40, y2: 30, color: '#111' },
      { id: 'c', type: 'linea', x1: 200, y1: 0, x2: 260, y2: 0, color: '#111' },
    ], ['a', 'b', 'c'])
    const polys = out.objects.filter((o) => o.type === 'polilinea')
    const leftover = out.objects.filter((o) => o.id === 'c')
    assert.equal(polys.length, 1)
    assert.equal(polys[0].points.length, 3)
    assert.equal(leftover.length, 1)
    assert.equal(leftover[0].type, 'linea')
  })

  it('splits a crossing into chains that share the intersection and ignores rects', () => {
    const out = joinIntersectingLines([
      { id: 'h', type: 'linea', x1: 0, y1: 10, x2: 20, y2: 10 },
      { id: 'v', type: 'linea', x1: 10, y1: 0, x2: 10, y2: 20 },
      { id: 'r', type: 'rect', x1: 0, y1: 0, x2: 5, y2: 5 },
    ])
    assert.ok(out.objects.some((o) => o.type === 'rect' && o.id === 'r'))
    assert.equal(out.objects.filter((o) => o.id === 'h' || o.id === 'v').length, 0)
    const chains = out.objects.filter((o) => o.type === 'linea' || o.type === 'polilinea')
    assert.ok(chains.length >= 1)
    assert.ok(out.joined >= 1)
  })

  it('joins a third line against the polyline from a previous join', () => {
    const first = joinIntersectingLines([
      { id: 'a', type: 'linea', x1: 0, y1: 0, x2: 40, y2: 0 },
      { id: 'b', type: 'linea', x1: 40, y1: 0, x2: 40, y2: 30 },
    ])
    const poly = first.objects.find((o) => o.type === 'polilinea')
    assert.ok(poly)
    const second = joinIntersectingLines([
      ...first.objects,
      { id: 'c', type: 'linea', x1: 20, y1: -10, x2: 20, y2: 10 },
    ])
    assert.ok(second.joined >= 1)
    assert.equal(second.objects.some((o) => o.id === 'c'), false)
    assert.ok(second.objects.some((o) => o.type === 'polilinea' || o.type === 'linea'))
  })

  it('join uses rotated world geometry, not stored x1/x2', () => {
    const rot = Math.PI / 2
    const rotated = { id: 'r', type: 'linea', x1: 0, y1: 0, x2: 40, y2: 0, rotation: rot }
    const other = { id: 'v', type: 'linea', x1: 0, y1: -5, x2: 40, y2: -5 }
    const out = joinIntersectingLines([rotated, other])
    assert.ok(out.joined >= 1)
    assert.ok(out.objects.every((o) => !o.rotation))
  })

  it('Terminar only commits the typed sequence and never closes last→first', () => {
    const objects = [
      { id: 'n1', type: 'nodo', nodeNum: '1', x: 0, y: 0 },
      { id: 'n2', type: 'nodo', nodeNum: '2', x: 40, y: 0 },
      { id: 'n3', type: 'nodo', nodeNum: '3', x: 40, y: 30 },
      { id: 'ab', type: 'linea', joinSeq: true, x1: 0, y1: 0, x2: 40, y2: 0 },
      { id: 'bc', type: 'linea', joinSeq: true, x1: 40, y1: 0, x2: 40, y2: 30 },
    ]
    const next = finalizeJoinSequence(objects)
    assert.equal(next.filter((o) => o.type === 'linea').length, 2)
    assert.ok(next.every((o) => !o.joinSeq))
    assert.equal(next.some((o) => o.type === 'linea' && o.x1 === 40 && o.y1 === 30 && o.x2 === 0 && o.y2 === 0), false)
  })

  it('materializeJoinAsClosedPolygon cierra sin repetir el primer nodo', () => {
    const objects = [
      { id: 'n1', type: 'nodo', nodeNum: '1', x: 0, y: 0, color: '#111' },
      { id: 'n2', type: 'nodo', nodeNum: '2', x: 40, y: 0 },
      { id: 'n3', type: 'nodo', nodeNum: '3', x: 40, y: 30 },
      { id: 'n4', type: 'nodo', nodeNum: '4', x: 0, y: 30 },
      { id: 'draft', type: 'polilinea', joinSeq: true, closed: true, points: [
        { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 },
      ] },
    ]
    const next = materializeJoinAsClosedPolygon(objects, ['1', '2', '3', '4'], {
      uid: () => 'poly-1',
      color: '#0f172a',
    })
    assert.equal(next.some((o) => o.joinSeq), false)
    const poly = next.find((o) => o.type === 'polilinea' && o.closed)
    assert.ok(poly)
    assert.equal(poly.id, 'poly-1')
    assert.equal(poly.points.length, 4)
    assert.equal(poly.fromJoinSequence, true)
    // No exige repetir el nodo 1 al final
    assert.notEqual(
      `${poly.points[0].x},${poly.points[0].y}`,
      `${poly.points[3].x},${poly.points[3].y}`,
    )
    const valid = validarEscenaPorTipo(next, 'poligono')
    assert.equal(valid.ok, true, valid.mensaje)
  })

  it('materialize acepta cierre explícito 1-2-3-1 sin duplicar el primer vértice', () => {
    const objects = [
      { id: 'n1', type: 'nodo', nodeNum: '1', x: 0, y: 0 },
      { id: 'n2', type: 'nodo', nodeNum: '2', x: 10, y: 0 },
      { id: 'n3', type: 'nodo', nodeNum: '3', x: 5, y: 8 },
    ]
    const next = materializeJoinAsClosedPolygon(objects, ['1', '2', '3', '1'], { uid: () => 'p' })
    const poly = next.find((o) => o.closed)
    assert.ok(poly)
    assert.equal(poly.points.length, 3)
  })

  it('materialize con menos de 3 nodos no inventa polígono', () => {
    const objects = [
      { id: 'n1', type: 'nodo', nodeNum: '1', x: 0, y: 0 },
      { id: 'n2', type: 'nodo', nodeNum: '2', x: 10, y: 0 },
      { id: 'ab', type: 'linea', joinSeq: true, x1: 0, y1: 0, x2: 10, y2: 0 },
    ]
    const next = materializeJoinAsClosedPolygon(objects, ['1', '2'])
    assert.equal(next.some((o) => o.type === 'polilinea' && o.closed), false)
    assert.ok(next.every((o) => !o.joinSeq))
    assert.equal(validarEscenaPorTipo(next, 'poligono').ok, false)
  })

  it('materialize con sentidoEje densifica y marca sentidoEje', async () => {
    const { gkBogotaToWgs84 } = await import('../../utils/epsg3116.js')
    const nodes = [
      { id: 'n1', type: 'nodo', nodeNum: '1', x: 0, y: 0, este: 1000010, norte: 1000000 },
      { id: 'n2', type: 'nodo', nodeNum: '2', x: 0, y: -4000, este: 1000010, norte: 1000080 },
      { id: 'n3', type: 'nodo', nodeNum: '3', x: 1000, y: -4000, este: 1000030, norte: 1000080 },
      { id: 'n4', type: 'nodo', nodeNum: '4', x: 1000, y: 0, este: 1000030, norte: 1000000 },
    ]
    const p0 = gkBogotaToWgs84(1000000, 1000000)
    const p1 = gkBogotaToWgs84(1000000, 1000080)
    const ejes = [{
      id: 0,
      puntos: [
        { m: 0, lng: p0.lng, lat: p0.lat },
        { m: 40, lng: p0.lng, lat: (p0.lat + p1.lat) / 2 },
        { m: 80, lng: p1.lng, lat: p1.lat },
      ],
    }]
    const result = materializeJoinAsClosedPolygon(nodes, ['1', '2', '3', '4'], {
      uid: () => 'poly-eje',
      sentidoEje: true,
      ejes,
      origin: { este0: 1000010, norte0: 1000000 },
      stepM: 5,
      returnMeta: true,
    })
    assert.equal(result.usedEje, true)
    const poly = result.objects.find((o) => o.closed)
    assert.ok(poly)
    assert.equal(poly.sentidoEje, true)
    assert.ok(poly.points.length > 4)
    assert.equal(validarEscenaPorTipo(result.objects, 'poligono').ok, true)
  })

  it('materialize sentidoEje=false permanece con vértices rectos', () => {
    const objects = [
      { id: 'n1', type: 'nodo', nodeNum: '1', x: 0, y: 0 },
      { id: 'n2', type: 'nodo', nodeNum: '2', x: 40, y: 0 },
      { id: 'n3', type: 'nodo', nodeNum: '3', x: 40, y: 30 },
      { id: 'n4', type: 'nodo', nodeNum: '4', x: 0, y: 30 },
    ]
    const next = materializeJoinAsClosedPolygon(objects, ['4', '3', '2', '1'], {
      uid: () => 'poly-rect',
      sentidoEje: false,
    })
    const poly = next.find((o) => o.closed)
    assert.ok(poly)
    assert.equal(poly.points.length, 4)
    assert.equal(poly.sentidoEje, false)
    // Respeta orden de unión (4→3→2→1)
    assert.equal(poly.points[0].x, 0)
    assert.equal(poly.points[0].y, 30)
  })

  it('buildJoinPolygonDraft marca closed desde 3 nodos', () => {
    const open = buildJoinPolygonDraft([
      { x: 0, y: 0 }, { x: 10, y: 0 },
    ], { uid: () => 'd1' })
    assert.ok(open)
    assert.equal(open.closed, false)
    assert.equal(open.joinSeq, true)
    const closed = buildJoinPolygonDraft([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    ], { uid: () => 'd2' })
    assert.equal(closed.closed, true)
    assert.equal(validarEscenaPorTipo([
      { type: 'nodo', x: 0, y: 0, nodeNum: '1' },
      { type: 'nodo', x: 10, y: 0, nodeNum: '2' },
      { type: 'nodo', x: 10, y: 10, nodeNum: '3' },
      closed,
    ], 'poligono').ok, true)
  })
})
