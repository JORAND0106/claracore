/**
 * Depura copias falsas creadas por el bug de conflicto en el mismo dispositivo.
 * Conserva la que tenga contenido; si ambas tienen contenido distinto, conserva ambas.
 */
import { softDeleteNote, listNotes } from './blocNotasDb'
import { isConflictCopyTitle } from './blocNotasConflict'
import { nowColombiaIso } from './blocNotasTime'

function bodyHasContent(body) {
  if (!body || typeof body !== 'object') return false
  if (Array.isArray(body.strokes) && body.strokes.length > 0) return true
  if (Array.isArray(body.postits) && body.postits.some((p) => String(p?.text || '').trim())) return true
  if (Array.isArray(body.esquemas) && body.esquemas.length > 0) return true
  if (Array.isArray(body.textBlocks) && body.textBlocks.some((b) => String(b?.text || '').trim())) return true
  const html = String(body.richHtml || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
  if (html.length > 0) return true
  return false
}

function bodyFingerprint(body) {
  try {
    return JSON.stringify({
      strokes: body?.strokes || [],
      postits: body?.postits || [],
      esquemas: (body?.esquemas || []).map((e) => e?.id || e?.updatedAt || ''),
      textBlocks: body?.textBlocks || [],
      richHtml: String(body?.richHtml || ''),
    })
  } catch {
    return ''
  }
}

/**
 * @returns {{ removed: number, kept: number }}
 */
export async function dedupeFalseConflictCopies(usuarioId, contratoId) {
  const notes = await listNotes(usuarioId, contratoId, null)
  const byId = new Map(notes.map((n) => [n.id, n]))
  let removed = 0
  let kept = 0
  const now = nowColombiaIso()

  for (const n of notes) {
    const isCopy = !!n.conflict_of || isConflictCopyTitle(n.title)
    if (!isCopy) {
      kept++
      continue
    }

    const hasContent = bodyHasContent(n.body)
    const parent = n.conflict_of ? byId.get(n.conflict_of) : null

    if (!hasContent) {
      await softDeleteNote(n.id, now)
      removed++
      continue
    }

    if (parent && bodyFingerprint(parent.body) === bodyFingerprint(n.body)) {
      await softDeleteNote(n.id, now)
      removed++
      continue
    }

    // Contenido distinto al padre (o sin padre): conservar
    kept++
  }

  return { removed, kept }
}
