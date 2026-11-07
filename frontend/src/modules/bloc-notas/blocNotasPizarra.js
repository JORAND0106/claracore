/**
 * Pizarra del contrato: post-its desde notas del Bloc.
 * Local-first para «Solo yo»; públicos cacheados del último pull.
 */
import { API_BASE } from '../../apiBase'
import { getOrCreateDeviceId } from '../../pwa/shellCache'
import { blocDb, getNote } from './blocNotasDb'
import { nowColombiaIso } from './blocNotasTime'

export const PIZARRA_SOLO_YO = 'solo_yo'
export const PIZARRA_CONTRATO = 'contrato'

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function newId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `pz_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export async function listPizarraLocal(contratoId, usuarioId) {
  const cid = Number(contratoId)
  const uid = Number(usuarioId)
  const rows = await blocDb.pizarra.where('contrato_id').equals(cid).toArray()
  return rows
    .filter((r) => !r.deleted_at)
    .filter((r) => r.visibilidad === PIZARRA_CONTRATO || Number(r.usuario_id) === uid)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
}

export async function getPizarraByNoteLocal(noteId) {
  if (!noteId) return null
  const rows = await blocDb.pizarra.where('note_id').equals(noteId).toArray()
  return rows.find((r) => !r.deleted_at) || null
}

export async function upsertPizarraLocal(row) {
  await blocDb.pizarra.put(row)
  return row
}

/** Enviar nota a la Pizarra (local + sync). */
export async function enviarNotaAPizarra({
  note,
  usuarioId,
  contratoId,
  visibilidad,
  token,
}) {
  if (!note?.id || !usuarioId || !contratoId) return null
  if (visibilidad !== PIZARRA_SOLO_YO && visibilidad !== PIZARRA_CONTRATO) {
    throw new Error('Visibilidad inválida')
  }
  const now = nowColombiaIso()
  const existing = await getPizarraByNoteLocal(note.id)
  const row = {
    id: existing?.id || newId(),
    note_id: note.id,
    contrato_id: Number(contratoId),
    usuario_id: Number(usuarioId),
    visibilidad,
    title: note.title || 'Nota',
    body: note.body || {},
    owner_nombre: null,
    created_at: existing?.created_at || now,
    updated_at: now,
    deleted_at: null,
    rev: (existing?.rev || 0) + 1,
    dirty: true,
    device_id: getOrCreateDeviceId(),
  }
  await upsertPizarraLocal(row)
  if (token && typeof navigator !== 'undefined' && navigator.onLine !== false) {
    await syncPizarra({ contratoId, usuarioId, token }).catch(() => {})
  }
  return row
}

export async function setPizarraVisibilidad({ id, visibilidad, usuarioId, contratoId, token }) {
  const row = await blocDb.pizarra.get(id)
  if (!row || Number(row.usuario_id) !== Number(usuarioId)) return null
  const now = nowColombiaIso()
  const next = {
    ...row,
    visibilidad,
    updated_at: now,
    rev: (row.rev || 1) + 1,
    dirty: true,
    deleted_at: null,
  }
  await upsertPizarraLocal(next)
  if (token && navigator.onLine !== false) {
    await syncPizarra({ contratoId, usuarioId, token }).catch(() => {})
  }
  return next
}

export async function quitarDePizarra({ id, usuarioId, contratoId, token }) {
  const row = await blocDb.pizarra.get(id)
  if (!row || Number(row.usuario_id) !== Number(usuarioId)) return null
  const now = nowColombiaIso()
  const next = {
    ...row,
    deleted_at: now,
    updated_at: now,
    rev: (row.rev || 1) + 1,
    dirty: true,
  }
  await upsertPizarraLocal(next)
  if (token && navigator.onLine !== false) {
    await syncPizarra({ contratoId, usuarioId, token }).catch(() => {})
  }
  return next
}

/** Si se elimina la nota, desaparece el post-it. */
export async function softDeletePizarraForNote(noteId, updatedAt) {
  const rows = await blocDb.pizarra.where('note_id').equals(noteId).toArray()
  for (const row of rows) {
    if (row.deleted_at) continue
    await upsertPizarraLocal({
      ...row,
      deleted_at: updatedAt,
      updated_at: updatedAt,
      rev: (row.rev || 1) + 1,
      dirty: true,
    })
  }
}

/** Refresca título/cuerpo locales del dueño tras editar la nota. */
export async function refreshPizarraFromNote(note) {
  if (!note?.id) return
  const pin = await getPizarraByNoteLocal(note.id)
  if (!pin || pin.deleted_at) return
  await upsertPizarraLocal({
    ...pin,
    title: note.title || pin.title,
    body: note.body || pin.body,
    updated_at: note.updated_at || nowColombiaIso(),
    dirty: true,
    rev: (pin.rev || 1) + 1,
  })
}

export async function syncPizarra({ contratoId, usuarioId, token }) {
  if (!contratoId || !usuarioId || !token) return { ok: false }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, offline: true }
  }
  const cid = Number(contratoId)
  const uid = Number(usuarioId)
  const deviceId = getOrCreateDeviceId()

  // Push dirty propios
  const dirty = (await blocDb.pizarra.where('contrato_id').equals(cid).toArray())
    .filter((r) => r.dirty && Number(r.usuario_id) === uid)

  if (dirty.length) {
    try {
      const res = await fetch(`${API_BASE}/bloc-notas/${cid}/pizarra/sync`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          device_id: deviceId,
          items: dirty.map((r) => ({
            id: r.id,
            note_id: r.note_id,
            visibilidad: r.visibilidad,
            updated_at: r.updated_at,
            rev: r.rev || 1,
            deleted: !!r.deleted_at,
            device_id: deviceId,
          })),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        for (const id of data.acked || dirty.map((d) => d.id)) {
          const row = await blocDb.pizarra.get(id)
          if (row) await upsertPizarraLocal({ ...row, dirty: false })
        }
      }
    } catch {
      /* offline mid-flight */
    }
  }

  // Pull visibles
  try {
    const res = await fetch(`${API_BASE}/bloc-notas/${cid}/pizarra`, {
      headers: authHeaders(token),
    })
    if (!res.ok) return { ok: false, status: res.status }
    const data = await res.json()
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
    const remoteIds = new Set()
    for (const it of items) {
      remoteIds.add(it.id)
      const local = await blocDb.pizarra.get(it.id)
      if (local?.dirty) continue
      await upsertPizarraLocal({
        id: it.id,
        note_id: it.note_id,
        contrato_id: cid,
        usuario_id: it.usuario_id,
        visibilidad: it.visibilidad,
        title: it.title || 'Nota',
        body: it.body || {},
        owner_nombre: it.owner_nombre || null,
        created_at: it.created_at,
        updated_at: it.updated_at,
        deleted_at: it.deleted_at || null,
        rev: it.rev || 1,
        dirty: false,
        device_id: it.device_id || null,
      })
    }
    // Soft-delete locales públicos que ya no vienen (y no son dirty propios)
    const locals = await blocDb.pizarra.where('contrato_id').equals(cid).toArray()
    for (const loc of locals) {
      if (loc.dirty) continue
      if (remoteIds.has(loc.id)) continue
      if (Number(loc.usuario_id) === uid && loc.visibilidad === PIZARRA_SOLO_YO) continue
      if (!loc.deleted_at) {
        await upsertPizarraLocal({
          ...loc,
          deleted_at: nowColombiaIso(),
          dirty: false,
        })
      }
    }
    return { ok: true, count: items.length }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

/** Enriquecer pin con nota local del dueño si está disponible. */
export async function hydratePizarraItem(item, usuarioId) {
  if (!item) return item
  if (Number(item.usuario_id) !== Number(usuarioId)) return item
  const note = await getNote(item.note_id)
  if (!note || note.deleted_at) return item
  return {
    ...item,
    title: note.title || item.title,
    body: note.body || item.body,
  }
}
