/**
 * Bloc de notas de campo — presentación tipo cuaderno real.
 * Local-first + sync; una acción de crear = una sola nota.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import SicoeMensajeModal from '../sicoe-obra/SicoeMensajeModal'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import TemaRichEditor from '../seguimiento/TemaRichEditor'
import { useClaraViewport } from '../../useClaraViewport'
import { isEsquemaPhoneViewport } from '../../components/esquema/esquemaMobileLayout'
import {
  emptyNoteBody,
  listFolders,
  listNotes,
  softDeleteFolder,
  softDeleteNote,
  upsertFolder,
  upsertNote,
  getNote,
} from './blocNotasDb'
import { syncBlocNotas } from './blocNotasSync'
import { formatColombiaDateTime, nowColombiaIso } from './blocNotasTime'
import { isQuotaExceededError, QUOTA_FULL_MESSAGE } from './blocNotasQuota'
import { getDefaultWriteMode, setDefaultWriteMode } from './blocNotasPrefs'
import { getOrCreateDeviceId } from '../../pwa/shellCache'
import BlocNotasNoteCanvas from './BlocNotasNoteCanvas'
import BlocNotasIconBtn from './BlocNotasIconBtn'
import BlocNotasPreguntaModal from './BlocNotasPreguntaModal'
import { dedupeFalseConflictCopies } from './blocNotasDedup'
import { createNoteHistory, matchUndoRedoKeys } from './blocNotasHistory'
import {
  PIZARRA_CONTRATO,
  PIZARRA_SOLO_YO,
  enviarNotaAPizarra,
  refreshPizarraFromNote,
  softDeletePizarraForNote,
  syncPizarra,
} from './blocNotasPizarra'

function newId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
}

const COVER_COLORS = ['#7C5C3B', '#5B7C6A', '#4A6FA5', '#8B5A2B', '#6B4E71', '#3D5A5B']

export default function ModuloBlocNotas({
  t,
  usuario,
  token,
  contratoId,
  initialNoteId = null,
  initialFolderId = null,
  onConsumedInitialTarget,
}) {
  const vp = useClaraViewport()
  const isPhone = isEsquemaPhoneViewport(vp)
  const uid = usuario?.id
  const cid = Number(contratoId || usuario?.contrato_id)

  const [folders, setFolders] = useState([])
  const [notes, setNotes] = useState([])
  const [folderId, setFolderId] = useState(initialFolderId || null)
  const [noteId, setNoteId] = useState(initialNoteId || null)
  const [note, setNote] = useState(null)
  const [tool, setTool] = useState(() => getDefaultWriteMode(usuario?.id))
  const [quotaOpen, setQuotaOpen] = useState(false)
  const [esquemaOpen, setEsquemaOpen] = useState(false)
  const [editEsquema, setEditEsquema] = useState(null)
  const [renameFolderId, setRenameFolderId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [prefAsk, setPrefAsk] = useState(null) // 'hand' | 'text' | null
  const [pizarraAsk, setPizarraAsk] = useState(false)
  const [histTick, setHistTick] = useState(0)
  const saveTimer = useRef(null)
  const syncTimer = useRef(null)
  const creatingRef = useRef(false)
  const creatingFolderRef = useRef(false)
  const historyRef = useRef(createNoteHistory())
  const noteRef = useRef(null)

  const openFolder = folders.find((f) => f.id === folderId) || null
  const noteIndex = notes.findIndex((n) => n.id === noteId)

  const reload = useCallback(async () => {
    if (!uid || !cid) return
    const f = await listFolders(uid, cid)
    setFolders(f)
    if (!folderId) {
      setNotes([])
      return
    }
    const n = await listNotes(uid, cid, folderId)
    setNotes(n)
  }, [uid, cid, folderId])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    setTool(getDefaultWriteMode(uid))
  }, [uid])

  // Abrir nota desde la Pizarra (Inicio)
  useEffect(() => {
    if (!initialNoteId) return undefined
    let cancelled = false
    ;(async () => {
      const row = await getNote(initialNoteId)
      if (cancelled || !row || row.deleted_at) {
        onConsumedInitialTarget?.()
        return
      }
      setFolderId(row.folder_id || initialFolderId || null)
      setNoteId(row.id)
      setNote(row)
      onConsumedInitialTarget?.()
    })()
    return () => { cancelled = true }
  }, [initialNoteId, initialFolderId, onConsumedInitialTarget])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!noteId) {
        setNote(null)
        noteRef.current = null
        historyRef.current.reset(null)
        return
      }
      const row = await getNote(noteId)
      if (!cancelled) {
        setNote(row || null)
        noteRef.current = row || null
        historyRef.current.reset(noteId)
        setHistTick((n) => n + 1)
      }
    })()
    return () => { cancelled = true }
  }, [noteId])

  useEffect(() => {
    noteRef.current = note
  }, [note])

  const scheduleSync = useCallback(() => {
    if (!token || !uid || !cid) return
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      syncBlocNotas({ contratoId: cid, usuarioId: uid, token })
        .then(() => syncPizarra({ contratoId: cid, usuarioId: uid, token }))
        .then(() => reload())
    }, 1500)
  }, [token, uid, cid, reload])

  const applyHistorySnap = useCallback((snap) => {
    if (!snap || !noteRef.current) return
    const next = {
      ...noteRef.current,
      title: snap.title,
      body: snap.body,
    }
    clearTimeout(saveTimer.current)
    setNote(next)
    noteRef.current = next
    saveTimer.current = setTimeout(async () => {
      const now = nowColombiaIso()
      const row = {
        ...next,
        updated_at: now,
        rev: (next.rev || 1) + 1,
        dirty: true,
        base_rev: next.base_rev == null ? null : next.base_rev,
        device_id: next.device_id || getOrCreateDeviceId(),
      }
      try {
        await upsertNote(row)
        setNote(row)
        noteRef.current = row
        await refreshPizarraFromNote(row)
        scheduleSync()
      } catch (e) {
        if (isQuotaExceededError(e)) setQuotaOpen(true)
      }
    }, 200)
    setHistTick((n) => n + 1)
  }, [scheduleSync])

  const undoNote = useCallback(() => {
    const cur = noteRef.current
    const prev = historyRef.current.undo(cur)
    if (prev) applyHistorySnap(prev)
  }, [applyHistorySnap])

  const redoNote = useCallback(() => {
    const cur = noteRef.current
    const next = historyRef.current.redo(cur)
    if (next) applyHistorySnap(next)
  }, [applyHistorySnap])

  useEffect(() => {
    if (!noteId) return undefined
    const onKey = (e) => {
      const action = matchUndoRedoKeys(e)
      if (!action) return
      e.preventDefault()
      if (action === 'undo') undoNote()
      else redoNote()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [noteId, undoNote, redoNote])

  useEffect(() => {
    if (!token || !uid || !cid) return undefined
    ;(async () => {
      await dedupeFalseConflictCopies(uid, cid)
      await syncBlocNotas({ contratoId: cid, usuarioId: uid, token })
      await syncPizarra({ contratoId: cid, usuarioId: uid, token })
      await reload()
    })()
    const onOnline = () => {
      syncBlocNotas({ contratoId: cid, usuarioId: uid, token })
        .then(() => syncPizarra({ contratoId: cid, usuarioId: uid, token }))
        .then(() => reload())
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [token, uid, cid, reload])

  const withQuota = async (fn) => {
    try {
      await fn()
    } catch (e) {
      if (isQuotaExceededError(e)) setQuotaOpen(true)
      else throw e
    }
  }

  const createFolder = async () => {
    if (!uid || !cid || creatingFolderRef.current) return
    creatingFolderRef.current = true
    try {
      const now = nowColombiaIso()
      const row = {
        id: newId(),
        contrato_id: cid,
        usuario_id: Number(uid),
        nombre: `Cuaderno ${folders.length + 1}`,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        rev: 1,
        dirty: true,
        device_id: getOrCreateDeviceId(),
      }
      await withQuota(async () => {
        await upsertFolder(row)
        await reload()
        setFolderId(row.id)
        setNoteId(null)
        scheduleSync()
      })
    } finally {
      creatingFolderRef.current = false
    }
  }

  const commitRenameFolder = async () => {
    if (!renameFolderId) return
    const name = renameValue.trim()
    if (!name) { setRenameFolderId(null); return }
    const existing = folders.find((f) => f.id === renameFolderId)
    if (!existing) { setRenameFolderId(null); return }
    const now = nowColombiaIso()
    await withQuota(async () => {
      await upsertFolder({
        ...existing,
        nombre: name.slice(0, 200),
        updated_at: now,
        rev: (existing.rev || 1) + 1,
        dirty: true,
      })
      setRenameFolderId(null)
      await reload()
      scheduleSync()
    })
  }

  const deleteFolder = async (id) => {
    const now = nowColombiaIso()
    await withQuota(async () => {
      await softDeleteFolder(id, now)
      if (folderId === id) {
        setFolderId(null)
        setNoteId(null)
      }
      await reload()
      scheduleSync()
    })
  }

  const createNote = async () => {
    if (!uid || !cid || !folderId || creatingRef.current) return
    creatingRef.current = true
    try {
      const now = nowColombiaIso()
      const mode = getDefaultWriteMode(uid)
      const body = { ...emptyNoteBody(), tool: mode }
      const row = {
        id: newId(),
        folder_id: folderId,
        contrato_id: cid,
        usuario_id: Number(uid),
        title: 'Nota',
        body,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        rev: 1,
        base_rev: null, // primera subida: sin chequeo de conflicto
        dirty: true,
        device_id: getOrCreateDeviceId(),
      }
      await withQuota(async () => {
        await upsertNote(row)
        await reload()
        setNoteId(row.id)
        setNote(row)
        setTool(mode)
        scheduleSync()
      })
    } finally {
      // Liberar tras un tick para evitar doble clic / Strict Mode doble fire
      setTimeout(() => { creatingRef.current = false }, 400)
    }
  }

  const persistNote = useCallback((next, { recordHistory = true } = {}) => {
    if (recordHistory && noteRef.current && !historyRef.current.applying) {
      historyRef.current.pushBeforeChange(noteRef.current)
      setHistTick((n) => n + 1)
    }
    clearTimeout(saveTimer.current)
    setNote(next)
    noteRef.current = next
    saveTimer.current = setTimeout(async () => {
      const now = nowColombiaIso()
      const row = {
        ...next,
        updated_at: now,
        rev: (next.rev || 1) + 1,
        dirty: true,
        // Conservar base_rev de la última sync; null sigue siendo null hasta el primer push OK
        base_rev: next.base_rev == null ? null : next.base_rev,
        device_id: next.device_id || getOrCreateDeviceId(),
      }
      try {
        await upsertNote(row)
        setNote(row)
        noteRef.current = row
        await refreshPizarraFromNote(row)
        scheduleSync()
      } catch (e) {
        if (isQuotaExceededError(e)) setQuotaOpen(true)
      }
    }, 320)
  }, [scheduleSync])

  const onBodyChange = (body) => {
    if (!note) return
    persistNote({ ...note, body })
  }

  const onTitleChange = (title) => {
    if (!note) return
    persistNote({ ...note, title })
  }

  const onRichHtmlChange = (html) => {
    if (!note) return
    const body = { ...(note.body || emptyNoteBody()), richHtml: html, tool: 'text' }
    persistNote({ ...note, body })
  }

  const requestTool = (nextTool) => {
    if (nextTool === tool) return
    if (nextTool === 'hand' || nextTool === 'text') {
      const currentDefault = getDefaultWriteMode(uid)
      if (nextTool !== currentDefault) {
        setPrefAsk(nextTool)
      }
    }
    setTool(nextTool)
    if (note) {
      const body = { ...(note.body || emptyNoteBody()), tool: nextTool }
      persistNote({ ...note, body })
    }
  }

  const deleteNote = async (id) => {
    const now = nowColombiaIso()
    await withQuota(async () => {
      await softDeleteNote(id, now)
      await softDeletePizarraForNote(id, now)
      if (noteId === id) {
        setNoteId(null)
        setNote(null)
      }
      await reload()
      scheduleSync()
    })
  }

  const confirmEnviarPizarra = async (visibilidad) => {
    setPizarraAsk(false)
    if (!note) return
    await withQuota(async () => {
      await enviarNotaAPizarra({
        note,
        usuarioId: uid,
        contratoId: cid,
        visibilidad,
        token,
      })
    })
  }

  const onEsquemaSave = async (dataUrl, extras) => {
    if (!note) return
    const body = note.body || emptyNoteBody()
    const esquemas = [...(body.esquemas || [])]
    const scene = extras?.scene || extras?.esquema_scene || null
    if (editEsquema?.id) {
      const idx = esquemas.findIndex((e) => e.id === editEsquema.id)
      if (idx >= 0) {
        esquemas[idx] = {
          ...esquemas[idx],
          pngDataUrl: dataUrl,
          scene,
          updatedAt: nowColombiaIso(),
        }
      }
    } else {
      esquemas.push({
        id: newId(),
        pngDataUrl: dataUrl,
        scene,
        title: 'Esquema',
        updatedAt: nowColombiaIso(),
      })
    }
    persistNote({ ...note, body: { ...body, esquemas } })
    setEsquemaOpen(false)
    setEditEsquema(null)
  }

  const goShelf = () => {
    setFolderId(null)
    setNoteId(null)
    setNote(null)
  }

  const openNotebook = (id) => {
    setFolderId(id)
    setNoteId(null)
    setNote(null)
  }

  const goPrevNote = () => {
    if (noteIndex <= 0) return
    setNoteId(notes[noteIndex - 1].id)
  }
  const goNextNote = () => {
    if (noteIndex < 0 || noteIndex >= notes.length - 1) return
    setNoteId(notes[noteIndex + 1].id)
  }

  if (!cid || !uid) {
    return (
      <div style={{ padding: 24, color: t?.textMuted }}>
        Seleccione un contrato.
      </div>
    )
  }

  const primary = t?.primary || '#0077B6'
  const pageBg = t?.bgCard || '#fff'
  const muted = t?.textMuted || '#64748b'

  const canUndo = histTick >= 0 && historyRef.current.canUndo()
  const canRedo = histTick >= 0 && historyRef.current.canRedo()

  // ── Estante de cuadernos ──────────────────────────────────────────────────
  if (!folderId) {
    return (
      <div style={{
        padding: '8px 8px 16px',
        width: '100%',
        maxWidth: '100%',
        margin: 0,
        boxSizing: 'border-box',
        minHeight: 'calc(100vh - 120px)',
        height: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: primary }}>Bloc de notas</span>
          <div style={{ flex: 1 }} />
          <BlocNotasIconBtn t={t} title="Nuevo cuaderno" onClick={createFolder}>📁+</BlocNotasIconBtn>
        </div>
        {folders.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 16px', color: muted, fontSize: 14,
            border: `1px dashed ${t?.border}`, borderRadius: 16,
          }}>
            Cree un cuaderno
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 20,
            padding: '8px 4px',
          }}>
            {folders.map((f, i) => {
              const cover = COVER_COLORS[i % COVER_COLORS.length]
              return (
                <div key={f.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  {renameFolderId === f.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRenameFolder}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRenameFolder() }}
                      title="Nombre del cuaderno"
                      style={{
                        width: '100%', padding: '6px 8px', borderRadius: 8,
                        border: `1px solid ${primary}`, background: t?.inputBg || t?.bg,
                        color: t?.text, fontSize: 13,
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      title={f.nombre}
                      aria-label={f.nombre}
                      onClick={() => openNotebook(f.id)}
                      style={{
                        width: '100%',
                        aspectRatio: '3 / 4',
                        maxWidth: 160,
                        border: 'none',
                        borderRadius: '4px 10px 10px 4px',
                        cursor: 'pointer',
                        background: `linear-gradient(90deg, ${cover} 0 10px, ${cover}dd 10px)`,
                        boxShadow: '4px 6px 14px rgba(0,0,0,0.22)',
                        color: '#fffef5',
                        fontWeight: 800,
                        fontSize: 14,
                        padding: '18px 14px 14px 20px',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        position: 'relative',
                      }}
                    >
                      <span style={{
                        writingMode: 'horizontal-tb',
                        wordBreak: 'break-word',
                        lineHeight: 1.25,
                        textShadow: '0 1px 2px rgba(0,0,0,0.35)',
                      }}>
                        {f.nombre}
                      </span>
                      <span aria-hidden style={{
                        position: 'absolute', left: 0, top: 12, bottom: 12, width: 8,
                        background: 'rgba(0,0,0,0.18)', borderRadius: '2px 0 0 2px',
                      }} />
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <BlocNotasIconBtn
                      t={t}
                      size={30}
                      title="Renombrar cuaderno"
                      onClick={() => { setRenameFolderId(f.id); setRenameValue(f.nombre || '') }}
                    >
                      ✎
                    </BlocNotasIconBtn>
                    <BlocNotasIconBtn
                      t={t}
                      size={30}
                      title="Eliminar cuaderno"
                      onClick={() => deleteFolder(f.id)}
                    >
                      🗑
                    </BlocNotasIconBtn>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <SicoeMensajeModal open={quotaOpen} onClose={() => setQuotaOpen(false)} t={t} title="Aviso" message={QUOTA_FULL_MESSAGE} />
      </div>
    )
  }

  // ── Cuaderno abierto (hojas) ──────────────────────────────────────────────
  return (
    <div style={{
      padding: '6px 6px 10px',
      width: '100%',
      maxWidth: '100%',
      margin: 0,
      boxSizing: 'border-box',
      minHeight: 'calc(100vh - 110px)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap', flexShrink: 0 }}>
        <BlocNotasIconBtn t={t} title="Volver a cuadernos" onClick={goShelf}>←</BlocNotasIconBtn>
        <span style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: primary }}>
          {openFolder?.nombre || 'Cuaderno'}
        </span>
        <div style={{ flex: 1 }} />
        <BlocNotasIconBtn t={t} title="Nueva nota" onClick={createNote}>＋</BlocNotasIconBtn>
        <BlocNotasIconBtn
          t={t}
          title="Renombrar cuaderno"
          onClick={() => { setRenameFolderId(folderId); setRenameValue(openFolder?.nombre || '') }}
        >
          ✎
        </BlocNotasIconBtn>
        <BlocNotasIconBtn t={t} title="Eliminar cuaderno" onClick={() => deleteFolder(folderId)}>🗑</BlocNotasIconBtn>
      </div>

      {renameFolderId === folderId && (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRenameFolder}
          onKeyDown={(e) => { if (e.key === 'Enter') commitRenameFolder() }}
          title="Nombre del cuaderno"
          style={{
            width: '100%', maxWidth: 360, marginBottom: 12, padding: '8px 10px', borderRadius: 8,
            border: `1px solid ${primary}`, background: t?.inputBg || t?.bg, color: t?.text,
          }}
        />
      )}

      {/* Lomo / hojas */}
      {!noteId ? (
        <div style={{
          borderRadius: 16,
          border: `1px solid ${t?.border}`,
          background: pageBg,
          boxShadow: '0 10px 28px rgba(0,0,0,0.08)',
          padding: '16px 14px 20px',
          minHeight: 320,
          flex: 1,
          width: '100%',
        }}>
          {notes.length === 0 ? (
            <div style={{ textAlign: 'center', color: muted, padding: 40, fontSize: 14 }}>
              Sin hojas · cree una nota
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notes.map((n, idx) => (
                <button
                  key={n.id}
                  type="button"
                  title={n.title || 'Nota'}
                  aria-label={n.title || 'Nota'}
                  onClick={() => setNoteId(n.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${t?.border}`,
                    background: t?.bg || '#f8fafc',
                    cursor: 'pointer',
                    color: t?.text,
                    boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.02), ${4 + idx % 3}px ${2 + idx % 2}px 0 rgba(0,0,0,0.04)`,
                  }}
                >
                  <span aria-hidden style={{
                    width: 28, height: 36, borderRadius: 3,
                    background: '#fffef8', border: '1px solid #e2e8f0', flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{n.title || 'Nota'}</span>
                    <span style={{ display: 'block', fontSize: 11, color: muted }}>
                      {formatColombiaDateTime(n.updated_at)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : note ? (
        <div style={{
          borderRadius: 16,
          border: `1px solid ${t?.border}`,
          background: pageBg,
          boxShadow: '0 12px 32px rgba(0,0,0,0.1)',
          padding: '10px 10px 12px',
          flex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, flexShrink: 0 }}>
            <BlocNotasIconBtn t={t} title="Hojas del cuaderno" onClick={() => { setNoteId(null); setNote(null) }}>☰</BlocNotasIconBtn>
            <BlocNotasIconBtn t={t} title="Hoja anterior" onClick={goPrevNote} disabled={noteIndex <= 0}>‹</BlocNotasIconBtn>
            <BlocNotasIconBtn t={t} title="Hoja siguiente" onClick={goNextNote} disabled={noteIndex < 0 || noteIndex >= notes.length - 1}>›</BlocNotasIconBtn>
            <input
              value={note.title || ''}
              onChange={(e) => onTitleChange(e.target.value)}
              title="Título"
              style={{
                flex: 1, minWidth: 100, padding: '8px 10px', borderRadius: 8,
                border: `1px solid ${t?.border}`, background: t?.inputBg || t?.bg,
                color: t?.text, fontWeight: 700, fontSize: 15,
              }}
            />
            <BlocNotasIconBtn t={t} title="Deshacer" onClick={undoNote} disabled={!canUndo}>↶</BlocNotasIconBtn>
            <BlocNotasIconBtn t={t} title="Rehacer" onClick={redoNote} disabled={!canRedo}>↷</BlocNotasIconBtn>
            <BlocNotasIconBtn t={t} title="Teclado" active={tool === 'text'} onClick={() => requestTool('text')}>⌨</BlocNotasIconBtn>
            <BlocNotasIconBtn t={t} title="Escritura a mano" active={tool === 'hand'} onClick={() => requestTool('hand')}>✍</BlocNotasIconBtn>
            <BlocNotasIconBtn t={t} title="Post-it" active={tool === 'postit'} onClick={() => requestTool('postit')}>📌</BlocNotasIconBtn>
            {!isPhone && (
              <BlocNotasIconBtn
                t={t}
                title="Esquema"
                onClick={() => { setEditEsquema(null); setEsquemaOpen(true) }}
              >
                ▦
              </BlocNotasIconBtn>
            )}
            <BlocNotasIconBtn t={t} title="Enviar a la Pizarra" onClick={() => setPizarraAsk(true)}>📋</BlocNotasIconBtn>
            <BlocNotasIconBtn t={t} title="Eliminar nota" onClick={() => deleteNote(note.id)}>🗑</BlocNotasIconBtn>
          </div>

          {tool === 'text' ? (
            <div style={{
              border: `1px solid ${t?.border}`,
              borderRadius: 12,
              overflow: 'auto',
              background: t?.bg || '#fff',
              flex: 1,
              minHeight: 280,
              display: 'flex',
              flexDirection: 'column',
            }}>
              <TemaRichEditor
                t={t}
                value={note.body?.richHtml || ''}
                onChange={onRichHtmlChange}
                editable
                minHeight={Math.max(320, (typeof window !== 'undefined' ? window.innerHeight : 800) - 260)}
                placeholder="Escriba la nota…"
                disableHistory
              />
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column' }}>
              <BlocNotasNoteCanvas
                t={t}
                body={note.body || emptyNoteBody()}
                tool={tool}
                onChange={onBodyChange}
              />
            </div>
          )}

          {((note.body?.esquemas) || []).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {(note.body.esquemas || []).map((esq) => (
                <div key={esq.id} style={{ position: 'relative' }}>
                  <img
                    src={esq.pngDataUrl}
                    alt={esq.title || 'Esquema'}
                    title={esq.title || 'Esquema'}
                    style={{
                      width: 120, height: 90, objectFit: 'contain',
                      border: `1px solid ${t?.border}`, borderRadius: 8, background: '#fff',
                    }}
                  />
                  {!isPhone && (
                    <button
                      type="button"
                      title="Editar esquema"
                      aria-label="Editar esquema"
                      data-cc-tooltip="Editar esquema"
                      onClick={() => { setEditEsquema(esq); setEsquemaOpen(true) }}
                      style={{
                        position: 'absolute', bottom: 4, right: 4,
                        width: 28, height: 28, borderRadius: 6, border: 'none',
                        background: primary, color: '#fff', cursor: 'pointer',
                      }}
                    >
                      ✎
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {esquemaOpen && !isPhone && (
        <EsquemaEditorModal
          t={t}
          title="Esquema · Bloc de notas"
          contratoId={cid}
          draftModule="bloc_notas"
          draftEntityId={note?.id || 'draft'}
          initialSceneSnapshot={editEsquema?.scene || null}
          onClose={() => { setEsquemaOpen(false); setEditEsquema(null) }}
          onSave={onEsquemaSave}
        />
      )}

      <SicoeMensajeModal
        open={quotaOpen}
        onClose={() => setQuotaOpen(false)}
        t={t}
        title="Aviso"
        message={QUOTA_FULL_MESSAGE}
      />

      <BlocNotasPreguntaModal
        open={!!prefAsk}
        t={t}
        title="Bloc de notas"
        message={
          prefAsk === 'hand'
            ? '¿Dejar escritura a mano como modo predeterminado?'
            : '¿Dejar teclado como modo predeterminado?'
        }
        onNo={() => setPrefAsk(null)}
        onSi={() => {
          if (prefAsk) setDefaultWriteMode(uid, prefAsk)
          setPrefAsk(null)
        }}
      />

      <BlocNotasPreguntaModal
        open={pizarraAsk}
        t={t}
        title="Enviar a la Pizarra"
        message="¿Quién puede ver este post-it?"
        noLabel="Solo yo"
        siLabel="Todo el contrato"
        onNo={() => confirmEnviarPizarra(PIZARRA_SOLO_YO)}
        onSi={() => confirmEnviarPizarra(PIZARRA_CONTRATO)}
      />
    </div>
  )
}
