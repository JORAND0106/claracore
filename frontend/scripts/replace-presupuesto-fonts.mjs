import fs from 'fs'
const path = new URL('../src/modules/presupuesto/ModuloPresupuesto.jsx', import.meta.url)
let s = fs.readFileSync(path, 'utf8')
const pairs = [
  ["fontSize:'22px'", "fontSize:'var(--cc-h2)'"],
  ['fontSize: \'22px\'', "fontSize: 'var(--cc-h2)'"],
  ["fontSize:'18px'", "fontSize:'var(--cc-lg)'"],
  ['fontSize: \'18px\'', "fontSize: 'var(--cc-lg)'"],
  ["fontSize:'16px'", "fontSize:'var(--cc-md)'"],
  ['fontSize: \'16px\'', "fontSize: 'var(--cc-md)'"],
  ["fontSize:'14px'", "fontSize:'var(--cc-md)'"],
  ['fontSize: \'14px\'', "fontSize: 'var(--cc-md)'"],
  ["fontSize:'13px'", "fontSize:'var(--cc-label)'"],
  ['fontSize: \'13px\'', "fontSize: 'var(--cc-label)'"],
  ["fontSize:'12px'", "fontSize:'var(--cc-sm)'"],
  ['fontSize: \'12px\'', "fontSize: 'var(--cc-sm)'"],
  ["fontSize:'11px'", "fontSize:'var(--cc-sm)'"],
  ['fontSize: \'11px\'', "fontSize: 'var(--cc-sm)'"],
  ["fontSize:'10px'", "fontSize:'var(--cc-caption)'"],
  ['fontSize: \'10px\'', "fontSize: 'var(--cc-caption)'"],
  ["fontSize:'9px'", "fontSize:'var(--cc-caption)'"],
  ['fontSize: \'9px\'', "fontSize: 'var(--cc-caption)'"],
  ["fontSize:'8px'", "fontSize:'var(--cc-caption)'"],
  ['fontSize: \'8px\'', "fontSize: 'var(--cc-caption)'"],
]
for (const [a, b] of pairs) {
  s = s.split(a).join(b)
}
fs.writeFileSync(path, s)
console.log('done', (s.match(/fontSize:.*px/g) || []).length, 'px left')
