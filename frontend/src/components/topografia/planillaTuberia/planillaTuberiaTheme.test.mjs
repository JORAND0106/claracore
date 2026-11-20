/**
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaTheme.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planillaBannerStyle, planillaSurfaceFromUi } from './planillaTuberiaTheme.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('planillaTuberiaTheme', () => {
  it('resuelve superficies desde useTopoTheme (card.background / t.bgCard)', () => {
    const fromTopo = planillaSurfaceFromUi({
      text: '#e2e8f0',
      textMuted: '#94a3b8',
      card: { background: '#0f172a' },
      grafico: { background: '#1e293b', labelFill: '#94a3b8' },
      t: { bgCard: '#0f172a', border: '#334155', inputBg: '#1e293b', text: '#e2e8f0', textMuted: '#94a3b8' },
    })
    assert.equal(fromTopo.cardBg, '#0f172a')
    assert.equal(fromTopo.inputBg, '#1e293b')
    assert.equal(fromTopo.border, '#334155')
    assert.equal(fromTopo.grafico.background, '#1e293b')

    const fromModal = planillaSurfaceFromUi({
      cardBg: '#111827',
      inputBg: '#1f2937',
      border: '#374151',
      text: '#f9fafb',
      textMuted: '#9ca3af',
    })
    assert.equal(fromModal.cardBg, '#111827')
    assert.equal(fromModal.inputBg, '#1f2937')
  })

  it('banners semánticos no usan fondos fijos claros', () => {
    const err = planillaBannerStyle('error', { t: { bgCard: '#0f172a' } })
    assert.match(String(err.background), /rgba\(220/)
    assert.doesNotMatch(String(err.background), /#fef2f2/i)
  })

  it('sección, perfil e ítem cobro consumen el helper de tema', () => {
    const seccion = readFileSync(join(dir, 'PlanillaTuberiaSeccionSvg.jsx'), 'utf8')
    const perfil = readFileSync(join(dir, 'PlanillaTuberiaPerfil.jsx'), 'utf8')
    const item = readFileSync(join(dir, 'PlanillaTuberiaItemCobro.jsx'), 'utf8')
    const form = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
    assert.match(seccion, /planillaSurfaceFromUi/)
    assert.match(perfil, /planillaSurfaceFromUi/)
    assert.match(item, /planillaSurfaceFromUi/)
    assert.match(item, /CcAnchoredListbox/)
    assert.match(form, /planillaBannerStyle/)
    assert.match(form, /t=\{ui\.t\}/)
    assert.doesNotMatch(seccion, /ui\?\.cardBg \|\| '#fff'/)
    assert.doesNotMatch(perfil, /stroke="#e2e8f0"/)
  })
})
