/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import {
  INFORMES_GRUPOS,
  INFORMES_INTRO,
  getInformesGrupos,
  resolveInformesBlueScale,
  informesSheetStyles,
} from './informesSheetStyles.js'

describe('informesSheetStyles', () => {
  const t = {
    text: '#0f172a',
    textMuted: '#64748b',
    bgCard: '#ffffff',
    bg: '#f8fafc',
    primary: '#0077B6',
    primaryLight: '#00B4C6',
    border: '#e2e8f0',
  }

  it('expone 6 grupos (incluye Biblioteca) con acentos de la escala azul e info sin negrita', () => {
    expect(Object.keys(INFORMES_GRUPOS)).toEqual(['biblio', 'sub', 'sem', 'ger', 'mes', 'ent'])
    const accents = new Set()
    for (const g of Object.values(INFORMES_GRUPOS)) {
      expect(g.accent).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(g.info.length).toBeGreaterThan(40)
      expect(g.label.length).toBeGreaterThan(5)
      accents.add(g.accent.toLowerCase())
    }
    expect(accents.size).toBe(6)
    expect(INFORMES_INTRO.length).toBeGreaterThan(60)
    expect(INFORMES_INTRO.toLowerCase()).not.toMatch(/identidad propia|ruta de ubicación/)
  })

  it('deriva la escala solo desde primary/primaryLight del tema', () => {
    const scale = resolveInformesBlueScale(t)
    expect(scale.mid.toLowerCase()).toBe('#0077b6')
    expect(scale.light.toLowerCase()).toBe('#00b4c6')
    const grupos = getInformesGrupos(t)
    expect(grupos.biblio.accent).toBe(scale.mid)
    expect(grupos.ger.accent).toBe(scale.midBright)
    expect(grupos.biblio.accent).not.toBe(grupos.ger.accent)
  })

  it('genera celdas con borde tipo Excel, separación fuerte y tipografía --cc-*', () => {
    const s = informesSheetStyles(t, INFORMES_GRUPOS.sem.accent)
    expect(s.th.border).toContain('1px solid')
    expect(s.td.border).toContain('1px solid')
    expect(s.th.fontSize).toBe('var(--cc-caption)')
    expect(s.infoBand.fontWeight).toBe(400)
    expect(s.infoBand.fontSize).toBe('var(--cc-body)')
    expect(s.groupPanel.borderLeft).toContain(INFORMES_GRUPOS.sem.accent)
    expect(s.groupPanel.marginTop).toBeGreaterThanOrEqual(36)
    expect(s.zoneWrap.border).toContain('2px solid')
    expect(s.typeSectionTitle.borderLeft).toContain('6px solid')
    expect(s.biblioFmtWrap.border).toContain('1px solid')
    expect(s.biblioConfigWrap.border).toContain('dashed')
    expect(s.biblioConfigBadge.fontWeight).toBe(700)
  })

  it('adapta contraste en tema oscuro y Descansar', () => {
    const dark = {
      ...t,
      bgCard: '#0f172a',
      text: '#e2e8f0',
      textMuted: '#94a3b8',
      primary: '#00B4C6',
      primaryLight: '#00D4E8',
    }
    const rest = {
      ...t,
      bgCard: '#F2EDE4',
      text: '#2A2318',
      textMuted: '#5C5346',
      primary: '#0E7490',
      primaryLight: '#14B8A6',
    }
    for (const theme of [dark, rest]) {
      const s = informesSheetStyles(theme, getInformesGrupos(theme).mes.accent)
      expect(s.border).toBeTruthy()
      expect(s.infoBand.color).toBeTruthy()
      expect(s.infoBand.fontWeight).toBe(400)
    }
  })
})
