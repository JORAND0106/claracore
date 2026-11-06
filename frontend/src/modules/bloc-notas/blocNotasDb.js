/**
 * IndexedDB local del Bloc de notas (Dexie).
 * Las notas nacen aquí; la nube es réplica.
 */
import Dexie from 'dexie'

export const blocDb = new Dexie('ClaraCore_BlocNotas_v1')

blocDb.version(1).stores({
  folders: 'id, contrato_id, usuario_id, updated_at, [usuario_id+contrato_id]',
  notes: 'id, folder_id, contrato_id, usuario_id, updated_at, [usuario_id+contrato_id]',
  sync_meta: 'key',
})

export function emptyNoteBody() {
  return {
    tool: 'hand', // hand | text
    strokes: [], // { id, color, width, points: [{x,y,p}] }
    textBlocks: [], // { id, x, y, w, h, text, fontSize }
    postits: [], // { id, x, y, w, h, color, text }
    esquemas: [], // { id, pngDataUrl, scene, title, updatedAt }
    canvas: { width: 1200, height: 1600, bg: '#fffef8' },
  }
}

export async function listFolders(usuarioId, contratoId) {
  const uid = Number(usuarioId)
  const cid = Number(contratoId)
  const rows = await blocDb.folders
    .where('[usuario_id+contrato_id]')
    .equals([uid, cid])
    .toArray()
  return rows
    .filter((r) => !r.deleted_at)
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
}

export async function listNotes(usuarioId, contratoId, folderId = null) {
  const uid = Number(usuarioId)
  const cid = Number(contratoId)
  const rows = await blocDb.notes
    .where('[usuario_id+contrato_id]')
    .equals([uid, cid])
    .toArray()
  return rows
    .filter((r) => !r.deleted_at)
    .filter((r) => (folderId == null ? true : r.folder_id === folderId))
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
}

export async function getNote(id) {
  return blocDb.notes.get(id)
}

export async function upsertFolder(row) {
  await blocDb.folders.put(row)
  return row
}

export async function upsertNote(row) {
  await blocDb.notes.put(row)
  return row
}

export async function softDeleteFolder(id, updatedAt) {
  const row = await blocDb.folders.get(id)
  if (!row) return
  await blocDb.folders.put({
    ...row,
    deleted_at: updatedAt,
    updated_at: updatedAt,
    rev: (row.rev || 1) + 1,
    dirty: true,
  })
}

export async function softDeleteNote(id, updatedAt) {
  const row = await blocDb.notes.get(id)
  if (!row) return
  await blocDb.notes.put({
    ...row,
    deleted_at: updatedAt,
    updated_at: updatedAt,
    rev: (row.rev || 1) + 1,
    dirty: true,
  })
}

export async function getDirtyPayload(usuarioId, contratoId) {
  const uid = Number(usuarioId)
  const cid = Number(contratoId)
  const folders = (await blocDb.folders.where('[usuario_id+contrato_id]').equals([uid, cid]).toArray())
    .filter((r) => r.dirty)
  const notes = (await blocDb.notes.where('[usuario_id+contrato_id]').equals([uid, cid]).toArray())
    .filter((r) => r.dirty)
  return { folders, notes }
}

export async function getSyncMeta(usuarioId, contratoId) {
  const key = `sync:${usuarioId}:${contratoId}`
  return blocDb.sync_meta.get(key)
}

export async function setSyncMeta(usuarioId, contratoId, patch) {
  const key = `sync:${usuarioId}:${contratoId}`
  const prev = (await blocDb.sync_meta.get(key)) || { key }
  await blocDb.sync_meta.put({ ...prev, ...patch, key })
}
