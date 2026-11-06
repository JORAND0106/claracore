/**
 * Módulo Bloc de notas de campo — por contrato, privado por usuario.
 * Local-first + sync automática.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import SicoeMensajeModal from '../sicoe-obra/SicoeMensajeModal'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
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
import BlocNotasNoteCanvas from './BlocNotasNoteCanvas'

function newId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
}

function IconBtn({ title, onClick, children, t, active = false, disabled = false }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        border: `1px solid ${active ? (t?.primary || '#0077B6') : (t?.border || '#cbd5e1')}`,
        background: active ? (t?.primary || '#0077B6') : (t?.bgCard || '#fff'),
        color: active ? '#fff' : (t?.text || '#0f172a'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

export default function ModuloBlocNotas({ t, usuario, token, contratoId }) {
  const vp = useClaraViewport()
  const isPhone = isEsquemaPhoneViewport(vp)
  const uid = usuario?.id
  const cid = Number(contratoId || usuario?.contrato_id)

  const [folders, setFolders] = useState([])
  const [notes, setNotes] = useState([])
  const [folderId, setFolderId] = useState(null)
  const [noteId, setNoteId] = useState(null)
  const [note, setNote] = useState(null)
  const [tool, setTool] = useState('hand')
  const [quotaOpen, setQuotaOpen] = useState(false)
  const [esquemaOpen, setEsquemaOpen] = useState(false)
  const [editEsquema, setEditEsquema] = useState(null)
  const [renameFolderId, setRenameFolderId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const saveTimer = useRef(null)
  const syncTimer = useRef(null)

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
    let cancelled = false
    ;(async () => {
      if (!noteId) { setNote(null); return }
      const row = await getNote(noteId)
      if (!cancelled) setNote(row || null)
    })()
    return () => { cancelled = true }
  }, [noteId])

  const scheduleSync = useCallback(() => {
    if (!token || !uid || !cid) return
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      syncBlocNotas({ contratoId: cid, usuarioId: uid, token }).then(() => reload())
    }, 1200)
  }, [token, uid, cid, reload])

  useEffect(() => {
    if (!token || !uid || !cid) return undefined
    syncBlocNotas({ contratoId: cid, usuarioId: uid, token }).then(() => reload())
    const onOnline = () => {
      syncBlocNotas({ contratoId: cid, usuarioId: uid, token }).then(() => reload())
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
    if (!uid || !cid) return
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
    }
    await withQuota(async () => {
      await upsertFolder(row)
      await reload()
      setFolderId(row.id)
      scheduleSync()
    })
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
      if (folderId === id) setFolderId(null)
      await reload()
      scheduleSync()
    })
  }

  const createNote = async () => {
    if (!uid || !cid || !folderId) return
    const now = nowColombiaIso()
    const row = {
      id: newId(),
      folder_id: folderId,
      contrato_id: cid,
      usuario_id: Number(uid),
      title: 'Nota',
      body: emptyNoteBody(),
      created_at: now,
      updated_at: now,
      deleted_at: null,
      rev: 1,
      base_rev: 0,
      dirty: true,
    }
    await withQuota(async () => {
      await upsertNote(row)
      await reload()
      setNoteId(row.id)
      setNote(row)
      scheduleSync()
    })
  }

  const persistNote = useCallback((next) => {
    clearTimeout(saveTimer.current)
    setNote(next)
    saveTimer.current = setTimeout(async () => {
      const now = nowColombiaIso()
      const row = {
        ...next,
        updated_at: now,
        rev: (next.rev || 1) + 1,
        dirty: true,
        base_rev: next.base_rev ?? next.rev ?? 0,
      }
      try {
        await upsertNote(row)
        setNote(row)
        scheduleSync()
      } catch (e) {
        if (isQuotaExceededError(e)) setQuotaOpen(true)
      }
    }, 280)
  }, [scheduleSync])

  const onBodyChange = (body) => {
    if (!note) return
    persistNote({ ...note, body })
  }

  const onTitleChange = (title) => {
    if (!note) return
    persistNote({ ...note, title })
  }

  const deleteNote = async (id) => {
    const now = nowColombiaIso()
    await withQuota(async () => {
      await softDeleteNote(id, now)
      if (noteId === id) { setNoteId(null); setNote(null) }
      await reload()
      scheduleSync()
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

  if (!cid || !uid) {
    return (
      <div style={{ padding: 24, color: t?.textMuted }}>
        Seleccione un contrato.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 4px 24px', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: t?.primary || '#0077B6' }}>
          Bloc de notas
        </span>
        <div style={{ flex: 1 }} />
        <IconBtn t={t} title="Nuevo cuaderno" onClick={createFolder}>📁+</IconBtn>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', minHeight: 420, flexWrap: 'wrap' }}>
        {/* Carpetas */}
        <div style={{
          width: 200, flexShrink: 0,
          border: `1px solid ${t?.border}`, borderRadius: 12,
          background: t?.bgCard, padding: 8, overflow: 'auto', maxHeight: 560,
        }}>
          {folders.length === 0 && (
            <div style={{ fontSize: 12, color: t?.textMuted, padding: 8 }}>Sin cuadernos</div>
          )}
          {folders.map((f) => (
            <div key={f.id} style={{ marginBottom: 4 }}>
              {renameFolderId === f.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRenameFolder}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitRenameFolder() }}
                  title="Nombre"
                  style={{
                    width: '100%', padding: '6px 8px', borderRadius: 8,
                    border: `1px solid ${t?.primary}`, background: t?.inputBg || t?.bg,
                    color: t?.text, fontSize: 13,
                  }}
                />
              ) : (
                <button
                  type="button"
                  title={f.nombre}
                  onClick={() => { setFolderId(f.id); setNoteId(null) }}
                  onDoubleClick={() => { setRenameFolderId(f.id); setRenameValue(f.nombre || '') }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '8px 10px',
                    borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: folderId === f.id ? (t?.primary || '#0077B6') : 'transparent',
                    color: folderId === f.id ? '#fff' : t?.text,
                    fontWeight: folderId === f.id ? 700 : 500, fontSize: 13,
                  }}
                >
                  {f.nombre}
                </button>
              )}
              {folderId === f.id && (
                <div style={{ display: 'flex', gap: 4, marginTop: 4, paddingLeft: 4 }}>
                  <IconBtn t={t} title="Renombrar" onClick={() => { setRenameFolderId(f.id); setRenameValue(f.nombre || '') }}>✎</IconBtn>
                  <IconBtn t={t} title="Eliminar cuaderno" onClick={() => deleteFolder(f.id)}>🗑</IconBtn>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Lista notas */}
        <div style={{
          width: 220, flexShrink: 0,
          border: `1px solid ${t?.border}`, borderRadius: 12,
          background: t?.bgCard, padding: 8, overflow: 'auto', maxHeight: 560,
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <IconBtn t={t} title="Nueva nota" onClick={createNote} disabled={!folderId}>＋</IconBtn>
          </div>
          {!folderId && (
            <div style={{ fontSize: 12, color: t?.textMuted, padding: 8 }}>Elija un cuaderno</div>
          )}
          {notes.map((n) => (
            <button
              key={n.id}
              type="button"
              title={n.title || 'Nota'}
              onClick={() => setNoteId(n.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 4,
                borderRadius: 8, border: 'none', cursor: 'pointer',
                background: noteId === n.id ? (t?.primary || '#0077B6') : 'transparent',
                color: noteId === n.id ? '#fff' : t?.text, fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600 }}>{n.title || 'Nota'}</div>
              <div style={{ fontSize: 10, opacity: 0.75 }}>
                {formatColombiaDateTime(n.updated_at)}
              </div>
            </button>
          ))}
        </div>

        {/* Editor */}
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!note ? (
            <div style={{
              flex: 1, border: `1px dashed ${t?.border}`, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: t?.textMuted, fontSize: 13, minHeight: 280,
            }}>
              Abra una nota
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={note.title || ''}
                  onChange={(e) => onTitleChange(e.target.value)}
                  title="Título"
                  style={{
                    flex: 1, minWidth: 120, padding: '8px 10px', borderRadius: 8,
                    border: `1px solid ${t?.border}`, background: t?.inputBg || t?.bgCard,
                    color: t?.text, fontWeight: 700, fontSize: 15,
                  }}
                />
                <IconBtn t={t} title="Escritura a mano" active={tool === 'hand'} onClick={() => setTool('hand')}>✍</IconBtn>
                <IconBtn t={t} title="Teclado" active={tool === 'text'} onClick={() => setTool('text')}>⌨</IconBtn>
                <IconBtn t={t} title="Post-it" active={tool === 'postit'} onClick={() => setTool('postit')}>📌</IconBtn>
                {!isPhone && (
                  <IconBtn
                    t={t}
                    title="Esquema"
                    onClick={() => { setEditEsquema(null); setEsquemaOpen(true) }}
                  >
                    ✎
                  </IconBtn>
                )}
                <IconBtn t={t} title="Eliminar nota" onClick={() => deleteNote(note.id)}>🗑</IconBtn>
              </div>

              <BlocNotasNoteCanvas
                t={t}
                body={note.body || emptyNoteBody()}
                tool={tool}
                onChange={onBodyChange}
              />

              {((note.body?.esquemas) || []).length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                          onClick={() => { setEditEsquema(esq); setEsquemaOpen(true) }}
                          style={{
                            position: 'absolute', bottom: 4, right: 4,
                            width: 28, height: 28, borderRadius: 6, border: 'none',
                            background: t?.primary || '#0077B6', color: '#fff', cursor: 'pointer',
                          }}
                        >
                          ✎
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

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
    </div>
  )
}
