/**
 * Recorrido con teclado de los formularios de Caja Menor.
 * El orden lo marca data-cm-orden. data-cm-saltar queda fuera del recorrido.
 */

function etiqueta(el) {
  return String(el?.tagName || '').toUpperCase()
}

export function esMultilinea(el) {
  return etiqueta(el) === 'TEXTAREA'
}

export function esFecha(el) {
  return String(el?.type || '').toLowerCase() === 'date'
}

function infoCursor(el) {
  let start
  let end
  try {
    start = el.selectionStart
    end = el.selectionEnd
  } catch {
    return null
  }
  if (typeof start !== 'number' || typeof end !== 'number') return null
  const value = String(el.value ?? '')
  const linea = value.slice(0, start).split('\n').length
  const total = value.split('\n').length || 1
  return {
    start,
    end,
    len: value.length,
    linea,
    total,
    todo: start === 0 && end === value.length,
  }
}

/**
 * @returns {'siguiente'|'anterior'|'quedarse'|null}
 * quedarse: el navegador sigue con la tecla (salto de línea o cursor).
 * null: no intervenir.
 */
export function accionTecla(evento, el) {
  if (!evento || !el) return null
  if (evento.isComposing || evento.key === 'Process') return null
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return null

  const key = evento.key
  const shift = !!evento.shiftKey
  const tag = etiqueta(el)
  const esTab = key === 'Tab'
  const esEnter = key === 'Enter'
  const esFlecha = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight'
  if (!esTab && !esEnter && !esFlecha) return null

  if (tag === 'BUTTON') {
    if (!el.hasAttribute?.('data-cm-orden')) return null
    if (esEnter) {
      if (el.hasAttribute?.('data-cm-guardar')) return null
      return shift ? 'anterior' : 'siguiente'
    }
    if (esTab || key === 'ArrowDown' || key === 'ArrowRight') return shift && esTab ? 'anterior' : 'siguiente'
    return 'anterior'
  }

  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return null
  if (!el.hasAttribute?.('data-cm-orden') && !el.hasAttribute?.('data-cm-saltar')) return null

  if (esFecha(el)) {
    if (key === 'ArrowUp' || key === 'ArrowLeft') return 'anterior'
    if (key === 'ArrowDown' || key === 'ArrowRight' || esEnter || esTab) {
      return shift && (esTab || esEnter) ? 'anterior' : 'siguiente'
    }
    return null
  }

  if (esEnter) {
    if (esMultilinea(el)) return 'quedarse'
    return shift ? 'anterior' : 'siguiente'
  }
  if (esTab) return shift ? 'anterior' : 'siguiente'

  const cursor = infoCursor(el)
  if (!cursor) {
    if (key === 'ArrowUp' || key === 'ArrowLeft') return 'anterior'
    return 'siguiente'
  }

  const haciaAdelante = key === 'ArrowDown' || key === 'ArrowRight'
  if (cursor.todo && cursor.len > 0) return haciaAdelante ? 'siguiente' : 'anterior'
  if (cursor.start !== cursor.end) return 'quedarse'

  if (key === 'ArrowLeft') return cursor.start === 0 ? 'anterior' : 'quedarse'
  if (key === 'ArrowRight') return cursor.start >= cursor.len ? 'siguiente' : 'quedarse'
  if (!esMultilinea(el)) return key === 'ArrowUp' ? 'anterior' : 'siguiente'
  if (key === 'ArrowUp') return cursor.linea <= 1 ? 'anterior' : 'quedarse'
  return cursor.linea >= cursor.total ? 'siguiente' : 'quedarse'
}

export function prepararEnterMultilinea(el) {
  if (!esMultilinea(el)) return
  const cursor = infoCursor(el)
  if (!cursor?.todo || cursor.len === 0) return
  try { el.setSelectionRange(cursor.len, cursor.len) } catch { /* el campo no admite rango */ }
}

function visible(el) {
  if (!el || el.disabled) return false
  if (el.hidden || el.getAttribute?.('type') === 'hidden') return false
  if (el.offsetParent != null) return true
  return el.getClientRects?.().length > 0
}

export function camposEnOrden(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  return [...root.querySelectorAll('[data-cm-orden]')]
    .filter((el) => visible(el) && !el.hasAttribute('data-cm-saltar'))
    .sort((a, b) => Number(a.getAttribute('data-cm-orden')) - Number(b.getAttribute('data-cm-orden')))
}

function indiceReferencia(root, el, campos) {
  const directo = campos.indexOf(el)
  if (directo >= 0) return directo
  const todos = [...root.querySelectorAll('[data-cm-orden], [data-cm-saltar]')]
  const pos = todos.indexOf(el)
  if (pos < 0) return null
  for (let i = pos - 1; i >= 0; i -= 1) {
    const encontrado = campos.indexOf(todos[i])
    if (encontrado >= 0) return encontrado
  }
  return -1
}

export function enfocarCampo(el) {
  if (!el || typeof el.focus !== 'function') return
  el.focus()
  const tag = etiqueta(el)
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    const marcar = () => {
      try { el.select() } catch { /* fecha */ }
      try {
        const len = String(el.value ?? '').length
        if (len > 0 && el.selectionEnd !== len) el.setSelectionRange(0, len)
      } catch { /* fecha */ }
    }
    marcar()
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(marcar)
  }
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

export function manejarTeclaCajaMenor(evento) {
  const root = evento.currentTarget
  const el = evento.target
  if (!root || !el || typeof root.contains !== 'function' || !root.contains(el)) return
  const accion = accionTecla(evento, el)
  if (!accion) return
  if (accion === 'quedarse') {
    if (evento.key === 'Enter') prepararEnterMultilinea(el)
    return
  }
  const campos = camposEnOrden(root)
  const indice = indiceReferencia(root, el, campos)
  if (indice == null) return
  const destino = campos[indice + (accion === 'siguiente' ? 1 : -1)]
  if (!destino) {
    if (evento.key === 'Enter' && etiqueta(el) === 'BUTTON' && !el.hasAttribute?.('data-cm-guardar')) {
      evento.preventDefault()
    }
    return
  }
  evento.preventDefault()
  enfocarCampo(destino)
}
