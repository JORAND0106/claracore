/**
 * Controles de Desarrollador para cargar / reemplazar / eliminar video
 * de una tarjeta del mapa (solo íconos + tooltip).
 */
import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../../apiBase'
import { MAPA_NAVEGACION_API_URL } from './mapaNavegacionCatalogo'

const ACCEPT_VIDEO = 'video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm'

function getToken(tokenProp) {
  return tokenProp || localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token') || ''
}

function iconBtnStyle(t, danger = false) {
  return {
    width: 34,
    height: 34,
    minWidth: 34,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: `1px solid ${danger ? '#ef444488' : t.border}`,
    background: t.bgCard || t.bg,
    color: danger ? '#dc2626' : t.primary,
    cursor: 'pointer',
    fontSize: 15,
    lineHeight: 1,
    flexShrink: 0,
  }
}

/**
 * @param {{
 *   t: object,
 *   tema: object,
 *   token?: string,
 *   onContenidoActualizado?: (contenido: object) => void,
 * }} props
 */
export default function MapaTemaVideoDevControls({
  t,
  tema,
  token,
  onContenidoActualizado,
}) {
  const [open, setOpen] = useState(false)
  const [pistas, setPistas] = useState([])
  const [pistaId, setPistaId] = useState('aurora')
  const [volumen, setVolumen] = useState(0.18)
  const [fase, setFase] = useState('') // '' | 'subiendo' | 'procesando' | 'listo' | 'error'
  const [progreso, setProgreso] = useState(0)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [ffmpegOk, setFfmpegOk] = useState(true)
  const fileRef = useRef(null)
  const xhrRef = useRef(null)

  const tieneVideo = !!String(tema?.videoUrl || '').trim()

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    const tok = getToken(token)
    fetch(`${API_BASE}${MAPA_NAVEGACION_API_URL}/pistas`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data?.pistas) ? data.pistas.filter((p) => p.disponible !== false) : []
        setPistas(list)
        if (list.length && !list.some((p) => p.id === pistaId)) {
          setPistaId(list[0].id)
        }
        if (typeof data?.volumen_default === 'number') {
          setVolumen(data.volumen_default)
        }
        if (typeof data?.ffmpeg_disponible === 'boolean') {
          setFfmpegOk(data.ffmpeg_disponible)
          if (!data.ffmpeg_disponible) {
            setMsg('El servidor aún no tiene la herramienta de compresión de video. Espere el redespliegue o contacte a un administrador.')
          }
        }
      })
      .catch(() => {
        if (!cancelled) setPistas([])
      })
    return () => { cancelled = true }
  }, [open, token, pistaId])

  function detenerXhr() {
    try { xhrRef.current?.abort?.() } catch { /* ignore */ }
    xhrRef.current = null
  }

  function subirArchivo(file) {
    if (!file || !tema?.id) return
    setBusy(true)
    setMsg('')
    setFase('subiendo')
    setProgreso(0)
    const tok = getToken(token)
    const fd = new FormData()
    fd.append('tema_id', tema.id)
    fd.append('pista_id', pistaId)
    fd.append('volumen', String(volumen))
    fd.append('file', file, file.name || 'capacitacion.mp4')

    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr
    xhr.open('POST', `${API_BASE}${MAPA_NAVEGACION_API_URL}/video`)
    if (tok) xhr.setRequestHeader('Authorization', `Bearer ${tok}`)
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return
      const pct = Math.min(92, Math.round((ev.loaded / ev.total) * 85))
      setProgreso(pct)
      if (pct >= 80) setFase('procesando')
    }
    xhr.onload = () => {
      xhrRef.current = null
      setBusy(false)
      let data = null
      try { data = JSON.parse(xhr.responseText || '{}') } catch { data = null }
      if (xhr.status >= 200 && xhr.status < 300 && data?.ok) {
        setFase('listo')
        setProgreso(100)
        setMsg('Video publicado con música de fondo.')
        if (data.contenido) onContenidoActualizado?.(data.contenido)
        window.setTimeout(() => {
          setOpen(false)
          setFase('')
          setProgreso(0)
          setMsg('')
        }, 900)
        return
      }
      setFase('error')
      const detail = data?.detail || data?.message || xhr.statusText || 'Error al procesar'
      setMsg(typeof detail === 'string' ? detail : 'No se pudo cargar el video.')
    }
    xhr.onerror = () => {
      xhrRef.current = null
      setBusy(false)
      setFase('error')
      setMsg('Error de red al subir el video.')
    }
    xhr.onabort = () => {
      xhrRef.current = null
      setBusy(false)
      setFase('')
      setProgreso(0)
      setMsg('Carga cancelada.')
    }
    setFase('subiendo')
    // Tras completar la subida el servidor comprime+mezcla; marcamos procesando
    // cuando el upload llegue al final.
    xhr.addEventListener('loadstart', () => setFase('subiendo'))
    xhr.send(fd)
    // Heurística: cuando upload llega a 100%, el servidor aún procesa.
    const prev = xhr.upload.onprogress
    xhr.upload.onprogress = (ev) => {
      prev?.(ev)
      if (ev.lengthComputable && ev.loaded >= ev.total) {
        setFase('procesando')
        setProgreso((p) => Math.max(p, 88))
      }
    }
  }

  async function eliminarVideo() {
    if (!tema?.id || !tieneVideo) return
    if (!window.confirm('¿Eliminar el video de esta tarjeta?')) return
    setBusy(true)
    setMsg('')
    try {
      const tok = getToken(token)
      const r = await fetch(`${API_BASE}${MAPA_NAVEGACION_API_URL}/video/${encodeURIComponent(tema.id)}`, {
        method: 'DELETE',
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.detail || data?.message || 'No se pudo eliminar')
      if (data.contenido) onContenidoActualizado?.(data.contenido)
      setMsg('Video eliminado.')
    } catch (e) {
      setMsg(e.message || 'No se pudo eliminar el video.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        style={{ display: 'flex', gap: 6, alignItems: 'center' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title={tieneVideo ? 'Reemplazar video de capacitación' : 'Cargar video de capacitación'}
          aria-label={tieneVideo ? 'Reemplazar video de capacitación' : 'Cargar video de capacitación'}
          disabled={busy}
          onClick={() => { setOpen(true); setMsg('') }}
          style={iconBtnStyle(t)}
        >
          {tieneVideo ? '🔄' : '⬆'}
        </button>
        {tieneVideo ? (
          <button
            type="button"
            title="Eliminar video de capacitación"
            aria-label="Eliminar video de capacitación"
            disabled={busy}
            onClick={eliminarVideo}
            style={iconBtnStyle(t, true)}
          >
            🗑
          </button>
        ) : null}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cargar video de capacitación"
          onClick={(e) => {
            e.stopPropagation()
            if (!busy) {
              detenerXhr()
              setOpen(false)
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100200,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(440px, 96vw)',
              borderRadius: 14,
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              color: t.text,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm)' }}>
                  {tieneVideo ? 'Reemplazar video' : 'Cargar video'}
                </div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 2 }}>
                  {tema?.nombre}
                </div>
              </div>
              <button
                type="button"
                title="Cerrar"
                aria-label="Cerrar"
                disabled={busy}
                onClick={() => { detenerXhr(); setOpen(false) }}
                style={iconBtnStyle(t)}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.4 }}>
              Se admite MP4 / MOV / M4V / WebM (grabación de pantalla o iPad).
              El servidor comprime el video y mezcla una pista aprobada (libre de derechos).
            </p>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-sm)' }}>
              Música de fondo
              <select
                value={pistaId}
                disabled={busy}
                onChange={(e) => setPistaId(e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.bg,
                  color: t.text,
                  fontSize: 16,
                }}
              >
                {(pistas.length ? pistas : [{ id: 'aurora', nombre: 'Aurora suave' }]).map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-sm)' }}>
              Volumen de fondo ({Math.round(volumen * 100)}%)
              <input
                type="range"
                min={0.05}
                max={0.35}
                step={0.01}
                value={volumen}
                disabled={busy}
                onChange={(e) => setVolumen(Number(e.target.value))}
              />
            </label>

            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_VIDEO}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) subirArchivo(f)
              }}
            />

            <button
              type="button"
              disabled={busy || !ffmpegOk}
              onClick={() => fileRef.current?.click()}
              style={{
                background: t.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '12px 14px',
                fontWeight: 800,
                fontSize: 'var(--cc-sm)',
                cursor: (busy || !ffmpegOk) ? 'not-allowed' : 'pointer',
                opacity: (busy || !ffmpegOk) ? 0.65 : 1,
                minHeight: 44,
              }}
            >
              {busy
                ? (fase === 'procesando' ? 'Comprimiendo y mezclando…' : 'Subiendo…')
                : (tieneVideo ? 'Elegir video de reemplazo' : 'Elegir video')}
            </button>

            {(fase === 'subiendo' || fase === 'procesando') && (
              <div>
                <div style={{
                  height: 8,
                  borderRadius: 99,
                  background: t.border,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${progreso}%`,
                    height: '100%',
                    background: t.primary,
                    transition: 'width 200ms ease',
                  }} />
                </div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 6 }}>
                  {fase === 'procesando'
                    ? 'Procesando en el servidor (compresión + música)…'
                    : `Subiendo… ${progreso}%`}
                </div>
              </div>
            )}

            {msg ? (
              <div style={{
                fontSize: 'var(--cc-caption)',
                color: fase === 'error' ? '#dc2626' : t.textMuted,
              }}>
                {msg}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}
