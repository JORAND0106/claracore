/**
 * Layout celular: pantalla completa, hoja inferior, sin romper iPad/portátil.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ESQUEMA_PHONE_SHEET_ORDER,
  ESQUEMA_PHONE_TOOL_CATEGORIES,
  isEsquemaPhoneViewport,
  nearestPhoneSheetSnap,
  phoneModalOuterSize,
  phoneSheetHeightPx,
} from './esquemaMobileLayout.js'
import { squareModalOuterSize, ESQUEMA_CONTEXT_SIDEBAR_W } from './esquemaGeometry.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('esquemaMobileLayout · detección celular', () => {
  it('retrato ≤767 y landscape ≤932 son teléfono; tablet/desktop no', () => {
    assert.equal(isEsquemaPhoneViewport({ isMobile: true, width: 390 }), true)
    assert.equal(isEsquemaPhoneViewport({ isLandscapeMobile: true, width: 844 }), true)
    assert.equal(isEsquemaPhoneViewport({ isMobile: false, isLandscapeMobile: false, width: 820, isTablet: true }), false)
    assert.equal(isEsquemaPhoneViewport({ isMobile: false, isLandscapeMobile: false, width: 1280, isDesktop: true }), false)
  })
})

describe('esquemaMobileLayout · ventana pantalla completa', () => {
  it('phoneModalOuterSize usa el viewport completo sin sidebar', () => {
    const s = phoneModalOuterSize(390, 844)
    assert.equal(s.w, 390)
    assert.equal(s.h, 844)
    assert.equal(s.sidebar, 0)
    assert.equal(s.phone, true)
  })

  it('iPad/portátil sigue con ventana cuadrada + lateral (sin cambiar contrato)', () => {
    const s = squareModalOuterSize(1400, 900, ESQUEMA_CONTEXT_SIDEBAR_W)
    assert.equal(s.h, s.side)
    assert.equal(s.w, s.side + ESQUEMA_CONTEXT_SIDEBAR_W)
    assert.ok(s.side >= 280)
  })

  it('retrato estrecho ya no fuerza lienzo colapsado por sidebar 300', () => {
    // Comportamiento histórico problemático:
    const legacy = squareModalOuterSize(390 * 0.98 - 32, 844 * 0.92 - 32, 300)
    assert.equal(legacy.h, 280) // mínimo histórico
    // Nuevo camino celular:
    const phone = phoneModalOuterSize(390, 844)
    assert.ok(phone.h > 600)
    assert.ok(phone.w >= 360)
  })
})

describe('esquemaMobileLayout · hoja inferior 3 alturas', () => {
  it('snaps contraída / media / completa y nearest', () => {
    assert.deepEqual(ESQUEMA_PHONE_SHEET_ORDER, ['collapsed', 'medium', 'full'])
    const vh = 800
    const c = phoneSheetHeightPx('collapsed', vh)
    const m = phoneSheetHeightPx('medium', vh)
    const f = phoneSheetHeightPx('full', vh)
    assert.ok(c < m && m < f)
    assert.equal(nearestPhoneSheetSnap(c + 2, vh), 'collapsed')
    assert.equal(nearestPhoneSheetSnap(m, vh), 'medium')
    assert.equal(nearestPhoneSheetSnap(f - 5, vh), 'full')
  })
})

describe('esquemaMobileLayout · barra compacta categorías', () => {
  it('incluye dibujo, edición, vistas y 3D, zoom, cálculo y despiece', () => {
    const ids = ESQUEMA_PHONE_TOOL_CATEGORIES.map((c) => c.id)
    assert.deepEqual(ids, ['dibujo', 'edicion', 'vistas3d', 'zoom', 'calculo'])
  })
})

describe('caso a–h · cableado en modal y popups', () => {
  it('modal usa layout celular, hoja, barra y popups fullscreen', () => {
    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /isEsquemaPhoneViewport/)
    assert.match(modal, /phoneModalOuterSize/)
    assert.match(modal, /EsquemaPhoneToolbar/)
    assert.match(modal, /EsquemaPhoneBottomSheet/)
    assert.match(modal, /data-phone-layout/)
    assert.match(modal, /phoneFullscreen=\{isPhoneLayout\}/)
    assert.match(modal, /document\.body\.style\.overflow = 'hidden'/)
    // iPad/portátil conserva toolbar clásica
    assert.match(modal, /display: isPhoneLayout \? 'none' : 'flex'/)
    // Lienzo no se oculta en celular: padding por hoja
    assert.match(modal, /phoneSheetHeightPxSafe/)
  })

  it('popups Extruir / cálculo / despiece soportan phoneFullscreen', () => {
    const extrude = readFileSync(join(__dirname, 'esquema3dUi.jsx'), 'utf8')
    assert.match(extrude, /phoneFullscreen/)
    assert.match(extrude, /data-phone-fullscreen/)
    const calc = readFileSync(join(__dirname, 'esquema3dCalcPanel.jsx'), 'utf8')
    assert.match(calc, /phoneFullscreenPopups/)
    assert.match(calc, /data-phone-fullscreen/)
    const desp = readFileSync(join(__dirname, 'esquemaDespiecePanel.jsx'), 'utf8')
    assert.match(desp, /phoneFullscreen/)
    assert.match(desp, /data-phone-fullscreen/)
  })

  it('componentes de barra y hoja existen con testids', () => {
    const tb = readFileSync(join(__dirname, 'EsquemaPhoneToolbar.jsx'), 'utf8')
    assert.match(tb, /esquema-phone-toolbar/)
    assert.match(tb, /esquema-phone-toolbar-scroll/)
    assert.match(tb, /esquema-phone-undo/)
    assert.match(tb, /esquema-phone-save/)
    assert.match(tb, /esquema-phone-close/)
    const sheet = readFileSync(join(__dirname, 'EsquemaPhoneBottomSheet.jsx'), 'utf8')
    assert.match(sheet, /esquema-phone-bottom-sheet/)
    assert.match(sheet, /esquema-phone-sheet-handle/)
  })
})
