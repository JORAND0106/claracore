/**
 * C-TX-14 / C-3D-17 / C-3D-19 · barra estable, tubería hueca, giro fluido.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCodoSolid,
  buildTeeSolid,
  buildTuberiaSolid,
  solidHasPipeBore,
} from './esquema3dPipeTemplates.js'
import { solidVolumeM3 } from './esquema3dSolids.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(__dirname, name), 'utf8')

describe('caso · barra estable + tubo hueco + giro fluido', () => {
  it('barra: solo ícono + tooltip; grupos atómicos; contextual separado', () => {
    const modal = read('EsquemaEditorModal.jsx')
    assert.match(modal, /data-testid="esquema-toolbar"/)
    assert.match(modal, /data-testid="esquema-toolbar-primary"/)
    assert.match(modal, /data-testid="esquema-toolbar-contextual"/)
    assert.match(modal, /data-toolbar-group="3d-calc"/)
    assert.match(modal, /flexWrap:\s*'nowrap'/)

    // Sin texto visible en botones problemáticos (solo aria/tooltip).
    assert.doesNotMatch(modal, /<span>Tubería y accesorios<\/span>/)
    assert.doesNotMatch(modal, /<span>\{realisticView \? 'Vista realista' : 'Vista técnica'\}<\/span>/)
    assert.doesNotMatch(modal, /<span>Solevar<\/span>/)
    assert.doesNotMatch(modal, /Cuadro de<br \/>despiece/)

    assert.match(modal, /aria-label="Tubería y accesorios"/)
    assert.match(modal, /aria-label=\{realisticView \? 'Vista realista' : 'Vista técnica'\}/)
    assert.match(modal, /aria-label="Solevar"/)
    assert.match(modal, /aria-label="Cuadro de despiece"/)
  })

  it('tubería / codo / TEE huecos con volumen exterior (caso b/c)', () => {
    const t = buildTuberiaSolid({
      diM: 0.30, espesorM: 0.02, lengthM: 3, cotaLomo: 1500,
    })
    assert.equal(t.ok, true)
    assert.equal(solidHasPipeBore(t.solid), true)
    assert.equal(Math.round(solidVolumeM3(t.solid) * 1000) / 1000, 0.272)
    assert.ok(t.solid.curveHoles?.some((h) => h.kind === 'ellipse_tube'))

    const c = buildCodoSolid('codo90', {
      diM: 0.30, espesorM: 0.02, bendRadiusM: 0.5, cotaLomo: 1500,
    })
    assert.equal(c.ok, true)
    assert.equal(solidHasPipeBore(c.solid), true)
    assert.ok((c.solid.curveHoles || []).length >= 1)

    const tee = buildTeeSolid({
      diM: 0.30, diBranchM: 0.20, espesorM: 0.02,
      lengthM: 1.2, branchLengthM: 0.6, cotaLomo: 1500,
    })
    assert.equal(tee.ok, true)
    assert.equal(solidHasPipeBore(tee.solid), true)
    assert.ok((tee.solid.curveHoles || []).length >= 2)
  })

  it('render de tubo usa curveHoles; órbita redibuja sin setOrbitTick en move', () => {
    const solids = read('esquema3dSolids.js')
    assert.match(solids, /curveHoles/)
    assert.match(solids, /pathRingWithHoles/)
    assert.match(solids, /evenodd/)

    const modal = read('EsquemaEditorModal.jsx')
    // Órbita / paneo: redraw directo en move (sin setState por frame).
    assert.match(modal, /scheduleViewRedraw/)
    assert.match(modal, /requestAnimationFrame/)
    assert.match(
      modal,
      /orbitAnglesRef\.current = \{ yaw, pitch \}[\s\S]{0,280}?scheduleViewRedraw\(\)/,
    )
    const orbitChunk = modal.slice(
      modal.indexOf('orbitAnglesRef.current = { yaw, pitch }'),
      modal.indexOf('orbitAnglesRef.current = { yaw, pitch }') + 320,
    )
    assert.doesNotMatch(orbitChunk, /setOrbitTick\(\(n\) => n \+ 1\)/)

    assert.match(
      modal,
      /d\.originX \+ \(src\.clientX - d\.startX\)[\s\S]{0,220}?scheduleViewRedraw\(\)/,
    )
  })

  it('contrato C-TX-14 / C-3D-19 + test:esquema', () => {
    const md = read('CONTRATO_ESQUEMA.md')
    assert.match(md, /C-TX-14/)
    assert.match(md, /C-3D-19/)
    assert.match(md, /caso 58|58\./)
    assert.match(md, /tubo hueco|hueca/i)
    assert.match(md, /esquemaBarraTuboGiro/)

    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaBarraTuboGiro\.scenario\.test\.js/)
  })
})
