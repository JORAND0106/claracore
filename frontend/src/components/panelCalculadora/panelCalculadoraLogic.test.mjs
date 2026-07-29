import {
  panelCalcApplyOp,
  panelCalcEvalChain,
  panelCalcCategoryId,
} from './panelCalculadoraLogic.js'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

assert(panelCalcApplyOp(10, '+', 5) === 15, 'sum')
assert(panelCalcApplyOp(10, '-', 3) === 7, 'sub')
assert(panelCalcApplyOp(4, '*', 2.5) === 10, 'mul')
assert(panelCalcApplyOp(10, '/', 4) === 2.5, 'div')
assert(panelCalcApplyOp(10, '/', 0) === null, 'div0')

const chain = [
  { type: 'num', value: 100 },
  { type: 'op', op: '+' },
  { type: 'num', value: 50 },
  { type: 'op', op: '*' },
  { type: 'num', value: 2 },
]
assert(panelCalcEvalChain(chain) === 300, 'left-to-right eval')
assert(panelCalcCategoryId('Aprobado', 'costo') === 'Aprobado::costo', 'cat id')
assert(panelCalcEvalChain([{ type: 'num', value: 7 }]) === 7, 'single')
assert(panelCalcEvalChain([]) === null, 'empty')

console.log('panelCalculadoraLogic ok')
