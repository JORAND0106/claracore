import assert from 'node:assert/strict'
import { computeCalPickerPosition } from './subcontratistaCalPickerPosition.js'

function testAbajoPorDefecto() {
  const pos = computeCalPickerPosition(
    { top: 100, bottom: 140, left: 50, right: 200, width: 150, height: 40 },
    { panelW: 260, panelH: 300, vw: 800, vh: 600 },
  )
  assert.equal(pos.top, 144)
  assert.equal(pos.left, 50)
}

function testVolteaArribaSiNoCabe() {
  const pos = computeCalPickerPosition(
    { top: 500, bottom: 540, left: 40, right: 190, width: 150, height: 40 },
    { panelW: 260, panelH: 300, vw: 800, vh: 560 },
  )
  assert.ok(pos.top < 500, `esperado flip arriba, top=${pos.top}`)
  assert.ok(pos.top + 300 <= 560 - 8 + 1)
}

function testClampaHorizontal() {
  const pos = computeCalPickerPosition(
    { top: 80, bottom: 120, left: 700, right: 850, width: 150, height: 40 },
    { panelW: 260, panelH: 300, vw: 800, vh: 600 },
  )
  assert.ok(pos.left + pos.width <= 800 - 8)
  assert.ok(pos.left >= 8)
}

testAbajoPorDefecto()
testVolteaArribaSiNoCabe()
testClampaHorizontal()
console.log('subcontratistaCalPickerPosition tests OK')
