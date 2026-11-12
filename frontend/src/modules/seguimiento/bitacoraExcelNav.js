/**
 * Navegación teclado tipo Excel para tablas de Bitácora.
 * Reutiliza la semántica de planillaTuberiaUtils.handleEnterAsTab
 * (Enter/flechas + caret-aware) y añade Tab / Shift+Tab.
 */

const FOCUSABLE_SELECTOR = [
  'input:not([disabled]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
].join(',')

const ROW_ATTR = 'data-bitacora-row'
const COL_ATTR = 'data-bitacora-col'

export function esVisibleParaFocoBitacora(el) {
  if (!el || el.disabled) return false
  if (el.getAttribute?.('tabindex') === '-1') return false
  if (el.offsetParent != null) return true
  return el.getClientRects?.().length > 0
}

/**
 * true → dejar que el navegador mueva el caret.
 * false → navegar entre celdas.
 */
export function caretPermiteEdicionTextoBitacora(el, key) {
  if (!el || (key !== 'ArrowLeft' && key !== 'ArrowRight')) return false
  let start
  let end
  try {
    start = el.selectionStart
    end = el.selectionEnd
  } catch {
    return false
  }
  if (typeof start !== 'number' || typeof end !== 'number') return false
  const len = String(el.value ?? '').length
  if (start !== end) {
    const todoSeleccionado = start === 0 && end === len
    return !todoSeleccionado
  }
  if (key === 'ArrowLeft') return start > 0
  return start < len
}

function listFocusables(rootEl) {
  if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return []
  return [...rootEl.querySelectorAll(FOCUSABLE_SELECTOR)].filter(esVisibleParaFocoBitacora)
}

function focusCell(el) {
  if (!el) return
  el.focus()
  if (typeof el.select === 'function' && String(el.tagName).toUpperCase() === 'INPUT') {
    try { el.select() } catch { /* ignore */ }
  }
}

/**
 * Enfoca la celda adyacente (delta = +1 siguiente, -1 anterior).
 * Útil tras seleccionar en un autocompletado.
 */
export function focusAdjacentBitacoraCell(fromEl, delta = 1) {
  const root = fromEl?.closest?.('.cc-bitacora-excel-nav')
  if (!root || !fromEl) return false
  const nodes = listFocusables(root)
  const idx = nodes.indexOf(fromEl)
  if (idx < 0) return false
  const next = nodes[idx + Number(delta)]
  if (!next) return false
  focusCell(next)
  return true
}

/**
 * Handler onKeyDown para un contenedor `.cc-bitacora-excel-nav`.
 * Tab/Enter → siguiente; Shift+Tab/Shift+Enter → anterior;
 * flechas con data-bitacora-row/col; ←/→ respetan caret.
 */
export function handleBitacoraExcelKeyNav(e, rootEl) {
  if (e.defaultPrevented) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const target = e.target
  if (!target || !rootEl || typeof rootEl.contains !== 'function' || !rootEl.contains(target)) return

  const tag = String(target.tagName || '').toUpperCase()
  if (tag === 'BUTTON' || tag === 'A') return
  const typ = String(target.type || '').toLowerCase()
  if (typ === 'button' || typ === 'submit' || typ === 'reset' || typ === 'checkbox' || typ === 'radio') return

  // Autocompletado abierto: no interceptar (el combobox maneja Enter/flechas).
  if (target.getAttribute?.('aria-expanded') === 'true') {
    if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') return
  }

  const key = e.key
  const isTab = key === 'Tab'
  const isEnter = key === 'Enter'
  const isArrow = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight'
  if (!isTab && !isEnter && !isArrow) return

  if (isArrow && tag === 'SELECT') return
  if (tag === 'TEXTAREA' && (isEnter || isArrow)) return

  if (
    (key === 'ArrowLeft' || key === 'ArrowRight')
    && tag === 'INPUT'
    && typ !== 'number'
    && typ !== 'time'
    && caretPermiteEdicionTextoBitacora(target, key)
  ) {
    return
  }

  e.preventDefault()
  const nodes = listFocusables(rootEl)
  const idx = nodes.indexOf(target)
  if (idx < 0) return

  let nextIdx = idx
  if (isTab || isEnter) {
    nextIdx = e.shiftKey ? idx - 1 : idx + 1
  } else {
    const row = Number(target.getAttribute?.(ROW_ATTR))
    const col = Number(target.getAttribute?.(COL_ATTR))
    if (Number.isFinite(row) && Number.isFinite(col) && target.hasAttribute?.(ROW_ATTR)) {
      let nr = row
      let nc = col
      if (key === 'ArrowUp') nr -= 1
      else if (key === 'ArrowDown') nr += 1
      else if (key === 'ArrowLeft') nc -= 1
      else if (key === 'ArrowRight') nc += 1
      const found = nodes.find(
        (el) => Number(el.getAttribute?.(ROW_ATTR)) === nr
          && Number(el.getAttribute?.(COL_ATTR)) === nc,
      )
      if (found) {
        focusCell(found)
        return
      }
    }
    if (key === 'ArrowLeft' || key === 'ArrowUp') nextIdx = idx - 1
    else nextIdx = idx + 1
  }

  const next = nodes[nextIdx]
  if (!next) return
  focusCell(next)
}

/** Props de celda para grilla 2D (fila/columna 0-based). */
export function bitacoraCellNavProps(row, col) {
  return {
    [ROW_ATTR]: row,
    [COL_ATTR]: col,
  }
}
