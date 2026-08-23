/**
 * Transacción que garantiza un bloque de texto editable tras cada tabla
 * de nivel documento (p. ej. para poder seguir escribiendo después de insertar).
 * Pura / testeable: no toca el DOM.
 *
 * @param {import('@tiptap/pm/state').EditorState} state
 * @returns {import('@tiptap/pm/state').Transaction | null}
 */
export function buildEnsureEditableAfterTablesTransaction(state) {
  if (!state?.doc || !state.schema) return null
  const paragraph = state.schema.nodes?.paragraph
  if (!paragraph) return null

  const { doc } = state
  const insertAt = []
  let pos = 0
  for (let i = 0; i < doc.childCount; i += 1) {
    const child = doc.child(i)
    const nextPos = pos + child.nodeSize
    if (child.type.name === 'table') {
      const next = i + 1 < doc.childCount ? doc.child(i + 1) : null
      // Hace falta un textblock (párrafo) inmediatamente después.
      if (!next || !next.isTextblock) {
        insertAt.push(nextPos)
      }
    }
    pos = nextPos
  }
  if (!insertAt.length) return null

  let tr = state.tr
  for (let i = insertAt.length - 1; i >= 0; i -= 1) {
    tr = tr.insert(insertAt[i], paragraph.create())
  }
  return tr
}

/**
 * ¿El documento necesita un párrafo tras alguna tabla?
 * @param {{ childCount: number, child: (i: number) => { type: { name: string }, nodeSize: number, isTextblock?: boolean } }} doc
 */
export function needsEditableAfterTable(doc) {
  if (!doc) return false
  for (let i = 0; i < doc.childCount; i += 1) {
    const child = doc.child(i)
    if (child.type.name !== 'table') continue
    const next = i + 1 < doc.childCount ? doc.child(i + 1) : null
    if (!next || !next.isTextblock) return true
  }
  return false
}
