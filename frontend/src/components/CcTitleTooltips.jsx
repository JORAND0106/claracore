import { useEffect } from 'react'

/**
 * Tooltips nativos (`title`) suelen fallar en iPadOS aunque haya Magic Keyboard /
 * trackpad. Este enhancer muestra un tip flotante con pointer mouse o puntero fino.
 */
export default function CcTitleTooltips() {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const tip = document.createElement('div')
    tip.id = 'cc-title-tooltip'
    tip.setAttribute('role', 'tooltip')
    Object.assign(tip.style, {
      position: 'fixed',
      zIndex: '2147483000',
      pointerEvents: 'none',
      maxWidth: '260px',
      padding: '6px 10px',
      borderRadius: '8px',
      background: 'rgba(15, 23, 42, 0.94)',
      color: '#f8fafc',
      fontSize: '12px',
      fontWeight: '600',
      lineHeight: '1.35',
      boxShadow: '0 8px 24px rgba(15,23,42,0.28)',
      display: 'none',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    })
    document.body.appendChild(tip)

    let activeEl = null
    let hideTimer = null
    let showTimer = null

    const fineCapable = () => {
      try {
        return window.matchMedia('(hover: hover) and (pointer: fine)').matches
      } catch {
        return false
      }
    }

    const shouldShowForEvent = (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') return false
      // iPad + Magic Keyboard: pointerType mouse; algunos builds reportan hover:none
      if (e.pointerType === 'mouse') return true
      return fineCapable()
    }

    const place = (clientX, clientY) => {
      const pad = 12
      const rect = tip.getBoundingClientRect()
      let left = clientX + 14
      let top = clientY + 16
      if (left + rect.width > window.innerWidth - pad) left = clientX - rect.width - 12
      if (top + rect.height > window.innerHeight - pad) top = clientY - rect.height - 12
      tip.style.left = `${Math.max(pad, left)}px`
      tip.style.top = `${Math.max(pad, top)}px`
    }

    const hide = () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
      tip.style.display = 'none'
      tip.textContent = ''
      if (activeEl?.dataset?.ccTitleHeld) {
        const held = activeEl.dataset.ccTitleHeld
        if (!activeEl.getAttribute('title') && held) activeEl.setAttribute('title', held)
        delete activeEl.dataset.ccTitleHeld
      }
      activeEl = null
    }

    const resolveText = (el) => {
      const custom = el.getAttribute('data-cc-tooltip')
      if (custom != null && String(custom).trim()) return String(custom).trim()
      const title = el.getAttribute('title')
      if (title != null && String(title).trim()) return String(title).trim()
      const aria = el.getAttribute('aria-label')
      if (aria != null && String(aria).trim() && el.matches('button, [role="button"], a, summary')) {
        // Solo si no hay title: evita duplicar en controles con label visible
        return null
      }
      return null
    }

    const showFor = (el, e) => {
      const text = resolveText(el)
      if (!text) return
      clearTimeout(hideTimer)
      activeEl = el
      // Quitar title nativo mientras se muestra el tip (evita doble tip / delay iPad)
      if (el.hasAttribute('title')) {
        el.dataset.ccTitleHeld = el.getAttribute('title') || ''
        el.removeAttribute('title')
      }
      tip.textContent = text
      tip.style.display = 'block'
      place(e.clientX, e.clientY)
    }

    const onPointerOver = (e) => {
      if (!shouldShowForEvent(e)) return
      const el = e.target?.closest?.('[title], [data-cc-tooltip]')
      if (!el || el === tip) return
      if (el.closest('[data-cc-tooltip-off]')) return
      clearTimeout(showTimer)
      showTimer = setTimeout(() => showFor(el, e), 280)
    }

    const onPointerOut = (e) => {
      const el = e.target?.closest?.('[title], [data-cc-tooltip], [data-cc-title-held]')
      if (!el || el !== activeEl) {
        // saliendo de un candidato no activo
        if (!activeEl) clearTimeout(showTimer)
        return
      }
      const related = e.relatedTarget
      if (related && el.contains(related)) return
      hideTimer = setTimeout(hide, 60)
    }

    const onPointerMove = (e) => {
      if (tip.style.display === 'block' && shouldShowForEvent(e)) {
        place(e.clientX, e.clientY)
      }
    }

    const onScroll = () => hide()
    const onKey = (e) => { if (e.key === 'Escape') hide() }

    document.addEventListener('pointerover', onPointerOver, true)
    document.addEventListener('pointerout', onPointerOut, true)
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('scroll', onScroll, true)
    document.addEventListener('keydown', onKey, true)

    return () => {
      hide()
      document.removeEventListener('pointerover', onPointerOver, true)
      document.removeEventListener('pointerout', onPointerOut, true)
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('keydown', onKey, true)
      tip.remove()
    }
  }, [])

  return null
}
