/**
 * Pizarra del contrato en Inicio (reemplaza Novedades).
 * Post-its desde el Bloc; solo_yo / contrato; lectura vs edición del dueño.
 */
import React, { useCallback, useEffect, useState } from 'react'
import SicoeMensajeModal from '../sicoe-obra/SicoeMensajeModal'
import BlocNotasIconBtn from './BlocNotasIconBtn'
import BlocNotasPreguntaModal from './BlocNotasPreguntaModal'
import {
  PIZARRA_CONTRATO,
  PIZARRA_SOLO_YO,
  hydratePizarraItem,
  listPizarraLocal,
  quitarDePizarra,
  setPizarraVisibilidad,
  syncPizarra,
} from './blocNotasPizarra'
import { formatColombiaDateTime } from './blocNotasTime'

const POSTIT_COLORS = ['#FEF08A', '#FBCFE8', '#BBF7D0', '#BFDBFE', '#FDBA74', '#E9D5FF']

function previewText(body) {
  if (!body) return ''
  const html = String(body.richHtml || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()
  if (html) return html.slice(0, 280)
  const post = (body.postits || []).map((p) => p.text).filter(Boolean).join(' · ')
  if (post) return post.slice(0, 280)
  if ((body.strokes || []).length) return 'Nota a mano'
  return ''
}

export default function PizarraInicio({
  t,
  fs,
  usuario,
  token,
  onAbrirEnBloc,
}) {
  const uid = usuario?.id
  const cid = usuario?.contrato_id
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [detalle, setDetalle] = useState(null)
  const [askVis, setAskVis] = useState(null) // item para cambiar visibilidad
  const [aviso, setAviso] = useState(null)

  const reload = useCallback(async () => {
    if (!cid || !uid) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      if (token && typeof navigator !== 'undefined' && navigator.onLine !== false) {
        await syncPizarra({ contratoId: cid, usuarioId: uid, token })
      }
      const local = await listPizarraLocal(cid, uid)
      const hydrated = []
      for (const it of local) {
        hydrated.push(await hydratePizarraItem(it, uid))
      }
      setItems(hydrated)
    } finally {
      setLoading(false)
    }
  }, [cid, uid, token])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    const onOnline = () => reload()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [reload])

  const primary = t?.primary || '#0077B6'
  const boardBg = t?.mode === 'dark' || t?.bg === '#0F1923'
    ? 'linear-gradient(160deg, #1e3a2f 0%, #163028 40%, #1a332c 100%)'
    : 'linear-gradient(160deg, #2f6b4f 0%, #245a42 45%, #1f4d39 100%)'

  return (
    <div
      data-testid="pizarra-inicio"
      style={{
        height: '100%',
        minHeight: 220,
        borderRadius: 16,
        border: `1px solid ${t?.border || '#334155'}`,
        background: boardBg,
        boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.06), 0 10px 28px rgba(0,0,0,0.18)',
        padding: '12px 12px 14px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        color: '#f8fafc',
      }}>
        <span style={{ fontWeight: 800, fontSize: fs?.base || 'var(--cc-md)' }}>Pizarra</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, opacity: 0.75 }}>
          {loading ? '…' : `${items.length} post-it${items.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Textura tipo pizarra */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.12,
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.35) 0.5px, transparent 0.5px)',
        backgroundSize: '7px 7px',
      }} />

      <div style={{
        flex: 1,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignContent: 'flex-start',
        overflow: 'auto',
        position: 'relative',
        zIndex: 1,
        minHeight: 120,
      }}>
        {items.length === 0 && !loading && (
          <div style={{
            color: 'rgba(248,250,252,0.85)', fontSize: 13, lineHeight: 1.45,
            padding: '28px 12px', width: '100%', textAlign: 'center',
          }}>
            Envíe notas desde el Bloc con «Enviar a la Pizarra».
          </div>
        )}
        {items.map((it, i) => {
          const color = POSTIT_COLORS[i % POSTIT_COLORS.length]
          const mine = Number(it.usuario_id) === Number(uid)
          return (
            <button
              key={it.id}
              type="button"
              title={it.title || 'Nota'}
              aria-label={it.title || 'Nota'}
              data-cc-tooltip={it.title || 'Nota'}
              onClick={() => setDetalle(it)}
              style={{
                width: 118,
                minHeight: 118,
                padding: '10px 10px 8px',
                border: 'none',
                borderRadius: 4,
                background: color,
                boxShadow: '3px 4px 10px rgba(0,0,0,0.28)',
                cursor: 'pointer',
                textAlign: 'left',
                transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (1.2 + (i % 3))}deg)`,
                color: '#1e293b',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 12, lineHeight: 1.25 }}>
                {(it.title || 'Nota').slice(0, 48)}
              </span>
              <span style={{ fontSize: 10, opacity: 0.75, marginTop: 'auto' }}>
                {mine
                  ? (it.visibilidad === PIZARRA_SOLO_YO ? 'Solo yo' : 'Contrato')
                  : (it.owner_nombre || 'Contrato')}
              </span>
            </button>
          )
        })}
      </div>

      {detalle && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setDetalle(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 12050,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 520, maxHeight: '85vh', overflow: 'auto',
              background: t?.bgCard || '#fff', color: t?.text,
              borderRadius: 16, border: `1px solid ${t?.border}`,
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)', padding: 16,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: primary }}>
                  {detalle.title || 'Nota'}
                </div>
                <div style={{ fontSize: 12, color: t?.textMuted, marginTop: 4 }}>
                  {formatColombiaDateTime(detalle.updated_at)}
                  {detalle.visibilidad === PIZARRA_SOLO_YO ? ' · Solo yo' : ' · Todo el contrato'}
                </div>
              </div>
              <BlocNotasIconBtn t={t} title="Cerrar" onClick={() => setDetalle(null)}>✕</BlocNotasIconBtn>
            </div>
            <div style={{
              whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5,
              minHeight: 80, marginBottom: 14,
              padding: 12, borderRadius: 10, background: t?.bg || '#f8fafc',
              border: `1px solid ${t?.border}`,
            }}>
              {previewText(detalle.body) || '—'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Number(detalle.usuario_id) === Number(uid) ? (
                <>
                  <button
                    type="button"
                    title="Abrir en el Bloc"
                    data-cc-tooltip="Abrir en el Bloc"
                    onClick={() => {
                      setDetalle(null)
                      onAbrirEnBloc?.(detalle)
                    }}
                    style={{
                      padding: '8px 14px', borderRadius: 8, border: 'none',
                      background: primary, color: '#fff', fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Abrir en el Bloc
                  </button>
                  <BlocNotasIconBtn
                    t={t}
                    title="Cambiar visibilidad"
                    onClick={() => setAskVis(detalle)}
                  >
                    👁
                  </BlocNotasIconBtn>
                  <BlocNotasIconBtn
                    t={t}
                    title="Quitar de la Pizarra"
                    onClick={async () => {
                      await quitarDePizarra({
                        id: detalle.id,
                        usuarioId: uid,
                        contratoId: cid,
                        token,
                      })
                      setDetalle(null)
                      reload()
                    }}
                  >
                    ✕
                  </BlocNotasIconBtn>
                </>
              ) : (
                <div style={{ fontSize: 12, color: t?.textMuted }}>
                  Solo lectura
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <BlocNotasPreguntaModal
        open={!!askVis}
        t={t}
        title="Visibilidad"
        message="¿Quién puede ver este post-it en la Pizarra?"
        noLabel="Solo yo"
        siLabel="Todo el contrato"
        onNo={async () => {
          if (askVis) {
            await setPizarraVisibilidad({
              id: askVis.id,
              visibilidad: PIZARRA_SOLO_YO,
              usuarioId: uid,
              contratoId: cid,
              token,
            })
            reload()
          }
          setAskVis(null)
        }}
        onSi={async () => {
          if (askVis) {
            await setPizarraVisibilidad({
              id: askVis.id,
              visibilidad: PIZARRA_CONTRATO,
              usuarioId: uid,
              contratoId: cid,
              token,
            })
            reload()
          }
          setAskVis(null)
        }}
      />

      <SicoeMensajeModal
        open={!!aviso}
        onClose={() => setAviso(null)}
        t={t}
        title="Pizarra"
        message={aviso || ''}
      />
    </div>
  )
}
