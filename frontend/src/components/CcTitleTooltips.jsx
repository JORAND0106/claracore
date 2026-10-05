import { useEffect } from 'react'
import {
  CC_TOOLTIP_BRAND_NAME,
  CC_TOOLTIP_FAVICON_SRC,
  adoptNativeTitle,
  adoptNativeTitlesInTree,
  ccTooltipPalette,
  placeTooltipRect,
  resolveTooltipThemeMode,
  resolveTooltipVariant,
} from './ccTooltipTheme.js'

const TIP_TARGET_SEL = '[data-cc-title-held], [data-cc-tooltip], [title]'

/**
 * Tooltips institucionales ClaraCore para `title` / `data-cc-tooltip`.
 * - Adopta todos los `title` nativos (sin excepciones de apariencia).
 * - Cortos (botones/iconos): sobrios, sin logo.
 * - Ayuda (`data-cc-tooltip-help` / texto largo): encabezado con favicon + ClaraCore.
 * - Hover: permanece mientras el cursor está sobre el elemento (sin cierre por tiempo).
 * - Táctil: al tocar; permanece hasta tocar en otro lugar.
 */
export default function CcTitleTooltips() {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const tip = document.createElement('div')
    tip.id = 'cc-title-tooltip'
    tip.className = 'cc-title-tooltip'
    tip.setAttribute('role', 'tooltip')
    tip.setAttribute('aria-hidden', 'true')
    document.body.appendChild(tip)

    let activeEl = null
    let hideTimer = null
    let showTimer = null
    let lastTouchShowAt = 0
    /** @type {'hover'|'touch'|null} */
    let mode = null
    let lastPointer = { x: 0, y: 0 }

    const fineCapable = () => {
      try {
        return window.matchMedia('(hover: hover) and (pointer: fine)').matches
      } catch {
        return false
      }
    }

    const applyThemeStyles = () => {
      const resolved = resolveTooltipThemeMode()
      const p = ccTooltipPalette(resolved)
      tip.dataset.ccTooltipTheme = resolved
      tip.style.setProperty('--cc-tip-bg', p.bg)
      tip.style.setProperty('--cc-tip-border', p.border)
      tip.style.setProperty('--cc-tip-text', p.text)
      tip.style.setProperty('--cc-tip-muted', p.textMuted)
      tip.style.setProperty('--cc-tip-shadow', p.shadow)
      tip.style.setProperty('--cc-tip-accent', p.accent)
      tip.style.setProperty('--cc-tip-header-bg', p.headerBg)
      tip.style.setProperty('--cc-tip-header-border', p.headerBorder)
      tip.style.setProperty('--cc-tip-brand', p.brand)
    }

    const ensureBaseStyle = () => {
      tip.style.position = 'fixed'
      tip.style.zIndex = '2147483000'
      tip.style.pointerEvents = 'none'
      tip.style.display = 'none'
      tip.style.boxSizing = 'border-box'
      tip.style.maxWidth = 'min(320px, calc(100vw - 24px))'
      tip.style.borderRadius = '10px'
      tip.style.border = '1px solid var(--cc-tip-border)'
      tip.style.background = 'var(--cc-tip-bg)'
      tip.style.color = 'var(--cc-tip-text)'
      tip.style.boxShadow = 'var(--cc-tip-shadow)'
      tip.style.fontFamily = "'Segoe UI', system-ui, sans-serif"
      tip.style.fontSize = 'var(--cc-sm, 13px)'
      tip.style.fontWeight = '600'
      tip.style.lineHeight = '1.4'
      tip.style.overflow = 'hidden'
    }

    applyThemeStyles()
    ensureBaseStyle()

    // Adopción inicial: elimina tips nativos negro/blanco en toda la app
    adoptNativeTitlesInTree(document)

    const themeObserver = new MutationObserver(() => applyThemeStyles())
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-cc-theme', 'style'],
    })

    const titleObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'title' && m.target) {
          adoptNativeTitle(/** @type {Element} */ (m.target))
          continue
        }
        if (m.type === 'childList') {
          m.addedNodes.forEach((node) => {
            if (node.nodeType === 1) adoptNativeTitlesInTree(/** @type {Element} */ (node))
          })
        }
      }
    })
    titleObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['title'],
    })

    const hide = () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
      tip.style.display = 'none'
      tip.innerHTML = ''
      tip.setAttribute('aria-hidden', 'true')
      tip.classList.remove('cc-title-tooltip--help', 'cc-title-tooltip--short')
      // No restaurar `title`: se mantiene en data-cc-title-held para bloquear el nativo
      activeEl = null
      mode = null
    }

    const resolveText = (el) => {
      const custom = el.getAttribute('data-cc-tooltip')
      if (custom != null && String(custom).trim()) return String(custom).trim()
      const held = el.getAttribute('data-cc-title-held') || el.dataset?.ccTitleHeld
      if (held != null && String(held).trim()) return String(held).trim()
      const title = el.getAttribute('title')
      if (title != null && String(title).trim()) return String(title).trim()
      return null
    }

    const renderContent = (text, variant) => {
      tip.innerHTML = ''
      tip.classList.toggle('cc-title-tooltip--help', variant === 'help')
      tip.classList.toggle('cc-title-tooltip--short', variant === 'short')

      if (variant === 'help') {
        const head = document.createElement('div')
        head.className = 'cc-title-tooltip__brand'
        head.style.cssText = [
          'display:flex',
          'align-items:center',
          'gap:8px',
          'padding:8px 12px',
          'background:var(--cc-tip-header-bg)',
          'border-bottom:1px solid var(--cc-tip-header-border)',
        ].join(';')

        const img = document.createElement('img')
        img.src = CC_TOOLTIP_FAVICON_SRC
        img.alt = ''
        img.width = 18
        img.height = 18
        img.draggable = false
        img.style.cssText = 'width:18px;height:18px;object-fit:contain;flex-shrink:0;display:block'

        const name = document.createElement('span')
        name.textContent = CC_TOOLTIP_BRAND_NAME
        name.style.cssText = [
          'font-size:var(--cc-caption, 12px)',
          'font-weight:800',
          'letter-spacing:0.02em',
          'color:var(--cc-tip-brand)',
          'line-height:1.2',
          'user-select:none',
        ].join(';')

        head.appendChild(img)
        head.appendChild(name)

        const body = document.createElement('div')
        body.className = 'cc-title-tooltip__body'
        body.style.cssText = 'padding:10px 12px;font-weight:600;white-space:pre-wrap;word-break:break-word'
        body.textContent = text

        tip.appendChild(head)
        tip.appendChild(body)
      } else {
        const body = document.createElement('div')
        body.className = 'cc-title-tooltip__body'
        body.style.cssText = 'padding:7px 11px;font-weight:600;white-space:pre-wrap;word-break:break-word'
        body.textContent = text
        tip.appendChild(body)
      }
    }

    const placeNearAnchor = (el) => {
      const rect = el.getBoundingClientRect()
      tip.style.visibility = 'hidden'
      tip.style.display = 'block'
      tip.style.left = '0px'
      tip.style.top = '0px'
      const tipRect = tip.getBoundingClientRect()
      const pos = placeTooltipRect(
        rect,
        { width: tipRect.width, height: tipRect.height },
        { width: window.innerWidth, height: window.innerHeight },
      )
      tip.style.left = `${pos.left}px`
      tip.style.top = `${pos.top}px`
      tip.style.visibility = 'visible'
    }

    const showFor = (el, nextMode) => {
      const text = resolveText(el)
      if (!text) return
      clearTimeout(hideTimer)
      activeEl = el
      mode = nextMode
      if (el.hasAttribute('title')) adoptNativeTitle(el)
      const variant = resolveTooltipVariant(el, text)
      applyThemeStyles()
      renderContent(text, variant)
      tip.setAttribute('aria-hidden', 'false')
      placeNearAnchor(el)
    }

    const findTipTargetAt = (x, y) => {
      let stack
      try {
        stack = document.elementsFromPoint(x, y)
      } catch {
        return null
      }
      for (const node of stack) {
        if (!node || node === tip || tip.contains(node)) continue
        if (node.closest?.('[data-cc-tooltip-off]')) return null
        const hit = node.closest?.(TIP_TARGET_SEL)
        if (hit && hit !== tip) return hit
      }
      return null
    }

    const shouldTrackHover = (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') return false
      if (e.pointerType === 'mouse') return true
      return fineCapable()
    }

    const scheduleShowHover = (el) => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
      if (activeEl === el && mode === 'hover' && tip.style.display === 'block') {
        placeNearAnchor(el)
        return
      }
      showTimer = setTimeout(() => showFor(el, 'hover'), 260)
    }

    const scheduleHideHover = () => {
      clearTimeout(showTimer)
      if (mode === 'touch') return
      hideTimer = setTimeout(() => {
        if (mode === 'hover') hide()
      }, 60)
    }

    const onPointerMove = (e) => {
      lastPointer = { x: e.clientX, y: e.clientY }
      if (!shouldTrackHover(e)) return
      // Si hay tip táctil activo, el mouse no lo cierra hasta salir/click
      if (mode === 'touch') return
      const hit = findTipTargetAt(e.clientX, e.clientY)
      if (hit) scheduleShowHover(hit)
      else if (activeEl && mode === 'hover') scheduleHideHover()
      else clearTimeout(showTimer)
    }

    const onPointerOver = (e) => {
      if (!shouldTrackHover(e)) return
      if (mode === 'touch') return
      const el = e.target?.closest?.(TIP_TARGET_SEL)
      if (!el || el === tip) return
      if (el.closest('[data-cc-tooltip-off]')) return
      scheduleShowHover(el)
    }

    const onPointerOut = (e) => {
      if (mode === 'touch') return
      const el = e.target?.closest?.(TIP_TARGET_SEL)
      if (!el || el !== activeEl) {
        if (!activeEl) clearTimeout(showTimer)
        return
      }
      const related = e.relatedTarget
      if (related && (el.contains(related) || tip.contains(related))) return
      // Confirmar con elementsFromPoint (cubre disabled / portales)
      const still = findTipTargetAt(lastPointer.x, lastPointer.y)
      if (still === activeEl) return
      scheduleHideHover()
    }

    /** Táctil: al tocar un control con tip, mostrar y permanecer hasta tocar fuera. */
    const onPointerUp = (e) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return
      const el = e.target?.closest?.(TIP_TARGET_SEL)
      if (!el || el === tip) return
      if (el.closest('[data-cc-tooltip-off]')) return
      const text = resolveText(el)
      if (!text) return
      const now = Date.now()
      if (now - lastTouchShowAt < 350 && activeEl === el && mode === 'touch') return
      lastTouchShowAt = now
      showFor(el, 'touch')
    }

    const onPointerDownOutside = (e) => {
      if (!activeEl) return
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return
      const el = e.target?.closest?.(TIP_TARGET_SEL)
      if (el === activeEl || el === tip) return
      hide()
    }

    const onScroll = () => {
      if (!activeEl || tip.style.display !== 'block') return
      const r = activeEl.getBoundingClientRect()
      const off =
        r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth
      if (off) {
        hide()
        return
      }
      placeNearAnchor(activeEl)
    }

    const onKey = (e) => { if (e.key === 'Escape') hide() }
    const onResize = () => {
      if (activeEl && tip.style.display === 'block') placeNearAnchor(activeEl)
    }

    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('pointerover', onPointerOver, true)
    document.addEventListener('pointerout', onPointerOut, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('pointerdown', onPointerDownOutside, true)
    document.addEventListener('scroll', onScroll, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onResize)

    return () => {
      hide()
      themeObserver.disconnect()
      titleObserver.disconnect()
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('pointerover', onPointerOver, true)
      document.removeEventListener('pointerout', onPointerOut, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('pointerdown', onPointerDownOutside, true)
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onResize)
      tip.remove()
    }
  }, [])

  return null
}
