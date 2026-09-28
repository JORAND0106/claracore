/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { INFORMES_GRUPOS, informesSheetStyles } from './informesSheetStyles.js'

describe('informesSheetStyles', () => {
  const t = {
    text: '#0f172a',
    textMuted: '#64748b',
    bgCard: '#ffffff',
    bg: '#f8fafc',
    primary: '#0077B6',
    border: '#e2e8f0',
  }

  it('expone 5 grupos con acento e info sin exigir negrita en la franja', () => {
    expect(Object.keys(INFORMES_GRUPOS)).toEqual(['sub', 'sem', 'ger', 'mes', 'ent'])
    for (const g of Object.values(INFORMES_GRUPOS)) {
      expect(g.accent).toMatch(/^#/)
      expect(g.info.length).toBeGreaterThan(40)
      expect(g.label.length).toBeGreaterThan(5)
    }
  })

  it('genera celdas con borde tipo Excel y tipografía --cc-*', () => {
    const s = informesSheetStyles(t, INFORMES_GRUPOS.sem.accent)
    expect(s.th.border).toContain('1px solid')
    expect(s.td.border).toContain('1px solid')
    expect(s.th.fontSize).toBe('var(--cc-caption)')
    expect(s.infoBand.fontWeight).toBe(400)
    expect(s.infoBand.fontSize).toBe('var(--cc-body)')
    expect(s.groupPanel.borderLeft).toContain(INFORMES_GRUPOS.sem.accent)
  })

  it('adapta contraste en tema oscuro', () => {
    const dark = { ...t, bgCard: '#0f172a', text: '#e2e8f0', textMuted: '#94a3b8' }
    const s = informesSheetStyles(dark, INFORMES_GRUPOS.mes.accent)
    expect(s.border).toBeTruthy()
    expect(s.infoBand.color).toBeTruthy()
  })
})
