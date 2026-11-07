/**
 * Historial de deshacer/rehacer a nivel de nota (teclado, mano, post-its).
 * Funciona con y sin conexión; no depende del servidor.
 */

function cloneBody(body) {
  try {
    return structuredClone(body)
  } catch {
    return JSON.parse(JSON.stringify(body || {}))
  }
}

export function createNoteHistory({ limit = 100, coalesceMs = 500 } = {}) {
  let past = []
  let future = []
  let applying = false
  let lastPushAt = 0
  let lastNoteId = null

  const snap = (note) => ({
    noteId: note?.id,
    title: note?.title ?? '',
    body: cloneBody(note?.body || {}),
  })

  return {
    reset(noteId = null) {
      past = []
      future = []
      applying = false
      lastPushAt = 0
      lastNoteId = noteId
    },

    /** Guarda el estado actual ANTES de aplicar un cambio del usuario. */
    pushBeforeChange(note) {
      if (applying || !note?.id) return
      if (lastNoteId != null && lastNoteId !== note.id) {
        past = []
        future = []
      }
      lastNoteId = note.id
      const entry = snap(note)
      const now = Date.now()
      if (past.length > 0 && now - lastPushAt < coalesceMs) {
        // Ráfaga de tecleo: conservar el primer estado del bloque
        lastPushAt = now
        future = []
        return
      }
      past.push(entry)
      if (past.length > limit) past.shift()
      future = []
      lastPushAt = now
    },

    canUndo() {
      return past.length > 0
    },

    canRedo() {
      return future.length > 0
    },

    undo(currentNote) {
      if (!past.length || !currentNote) return null
      applying = true
      const prev = past.pop()
      future.push(snap(currentNote))
      applying = false
      return prev
    },

    redo(currentNote) {
      if (!future.length || !currentNote) return null
      applying = true
      const next = future.pop()
      past.push(snap(currentNote))
      applying = false
      return next
    },

    get applying() {
      return applying
    },
  }
}

/** Atajos: Ctrl/Cmd+Z deshacer; Ctrl+Y o Cmd+Shift+Z rehacer. */
export function matchUndoRedoKeys(e) {
  const key = String(e.key || '').toLowerCase()
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return null
  if (key === 'z' && e.shiftKey && e.metaKey && !e.ctrlKey) return 'redo'
  if (key === 'z' && !e.shiftKey) return 'undo'
  if (key === 'y' && !e.shiftKey) return 'redo'
  return null
}
