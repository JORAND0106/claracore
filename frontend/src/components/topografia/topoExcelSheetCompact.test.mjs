/**
 * Layout compacto de TopoExcelSheet (móvil).
 * node --test frontend/src/components/topografia/topoExcelSheetCompact.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('TopoExcelSheet compact', () => {
  it('soporta prop compact y campos compactFull', () => {
    const src = readFileSync(join(dir, 'TopoExcelSheet.jsx'), 'utf8')
    assert.match(src, /compact = false/)
    assert.match(src, /cc-topo-sheet-compact/)
    assert.match(src, /gridTemplateColumns: 'repeat\(2, minmax\(0, 1fr\)\)'/)
    assert.match(src, /col\.compactFull/)
    assert.match(src, /function CompactField/)
  })

  it('Nivelación activa compact en Datos generales y Equipo', () => {
    const niv = readFileSync(join(dir, 'NivelacionForm.jsx'), 'utf8')
    assert.match(niv, /title="Datos generales"[\s\S]*?compact=\{isCompact\}/)
    assert.match(niv, /title="Equipo de medición"[\s\S]*?compact=\{isCompact\}/)
    assert.match(niv, /key: 'nombre'[\s\S]*?compactFull: true/)
    assert.match(niv, /key: 'operador'[\s\S]*?compactFull: true/)
  })

  it('escritorio sigue usando minWidth de tabla horizontal', () => {
    const niv = readFileSync(join(dir, 'NivelacionForm.jsx'), 'utf8')
    assert.match(niv, /minWidth=\{isCompact \? undefined : 720\}/)
    assert.match(niv, /minWidth=\{isCompact \? undefined : 400\}/)
  })
})
