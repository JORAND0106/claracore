/**
 * Mantiene visible el caret del editor TipTap/ProseMirror al escribir contenido
 * largo cuando el scroll real está en un ancestro (modal sheet), no en el prose.
 */

function isScrollableY(el) {
  if (!el || el === document.body || el === document.documentElement) return false
  try {
    const st = window.getComputedStyle(el)
    const oy = st.overflowY
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false
    return el.scrollHeight > el.clientHeight + 1
  } catch {
    return false
  }
}

/**
 * Desplaza ancestros con overflow para que `coords` quede en vista.
 * @param {{ top: number, bottom: number, left?: number, right?: number }} coords
 * @param {Element | null} fromEl
 * @param {{ padding?: number }} [opts]
 */
export function scrollCoordsIntoScrollParents(coords, fromEl, opts = {}) {
  if (!coords || !fromEl) return
  const padding = opts.padding ?? 28
  let parent = fromEl.parentElement
  while (parent && parent !== document.body) {
    if (isScrollableY(parent)) {
      const rect = parent.getBoundingClientRect()
      if (coords.bottom > rect.bottom - padding) {
        parent.scrollTop += coords.bottom - (rect.bottom - padding)
      } else if (coords.top < rect.top + padding) {
        parent.scrollTop -= (rect.top + padding) - coords.top
      }
    }
    parent = parent.parentElement
  }
  // Ventana / document scrolling element
  try {
    const se = document.scrollingElement || document.documentElement
    if (se) {
      const vh = window.innerHeight || se.clientHeight
      if (coords.bottom > vh - padding) {
        se.scrollTop += coords.bottom - (vh - padding)
      } else if (coords.top < padding) {
        se.scrollTop -= padding - coords.top
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Scroll del caret de un editor TipTap a la vista (editor + ancestros).
 * @param {{ view?: { state: { selection: { head: number } }, coordsAtPos: (n: number) => { top: number, bottom: number }, dom: Element, dispatch?: Function } } | null} editor
 */
export function scrollEditorCaretIntoView(editor) {
  const view = editor?.view
  if (!view) return
  try {
    // Scroll interno de ProseMirror cuando el propio editor tiene overflow.
    if (typeof editor.commands?.scrollIntoView === 'function') {
      editor.commands.scrollIntoView()
    }
  } catch {
    /* ignore */
  }
  try {
    const head = view.state.selection.head
    const coords = view.coordsAtPos(head)
    scrollCoordsIntoScrollParents(coords, view.dom)
  } catch {
    /* ignore */
  }
}

/** Exportado para tests: detecta overflow-y scrollable. */
export function _isScrollableYForTest(el) {
  return isScrollableY(el)
}
