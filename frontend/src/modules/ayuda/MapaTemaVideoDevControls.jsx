/**
 * Controles de Desarrollador para cargar / reemplazar / eliminar video
 * de una tarjeta del mapa (solo íconos + tooltip).
 * Carga directa: sin compresión ni música en servidor. Máximo 150 MB.
 */
import { useRef, useState } from 'react'
import { API_BASE } from '../../apiBase'
import { MAPA_NAVEGACION_API_URL } from './mapaNavegacionCatalogo'

const ACCEPT_VIDEO = 'video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm'
const MAX_UPLOAD_MB = 150
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

function getToken(tokenProp) {
  return tokenProp || localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token') || ''
}

function detalleErrorApi(data, fallback) {
  const d = data?.detail ?? data?.message
  if (typeof d === 'string' && d.trim()) return d
  if (Array.isArray(d) && d.length) {
    const parts = d.map((x) => (typeof x === 'string' ? x : x?.msg)).filter(Boolean)
    if (parts.length) return parts.join(' ')
  }
  return fallback
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
  const [fase, setFase] = useState('') // '' | 'subiendo' | 'listo' | 'error'
  const [progreso, setProgreso] = useState(0)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const pendingFileRef = useRef(null)
  const fileRef = useRef(null)
  const xhrRef = useRef(null)

  const tieneVideo = !!String(tema?.videoUrl || '').trim()

  function detenerXhr() {
    try { xhrRef.current?.abort?.() } catch { /* ignore */ }
    xhrRef.current = null
  }

  function resetMsg() {
    setMsg('')
    setFase('')
    setProgreso(0)
  }

  function elegirArchivo() {
    resetMsg()
    fileRef.current?.click()
  }

  function onArchivoElegido(file) {
    if (!file || !tema?.id) return
    if (file.size > MAX_UPLOAD_BYTES) {
      setFase('error')
      setMsg(
        `El video supera el máximo permitido de ${MAX_UPLOAD_MB} MB. `
        + 'Comprímalo antes de subirlo e intente de nuevo.',
      )
      return
    }
    if (tieneVideo) {
      pendingFileRef.current = file
      setConfirmReplace(true)
      return
    }
    subirArchivo(file)
  }

  function confirmarReemplazo(si) {
    setConfirmReplace(false)
    const file = pendingFileRef.current
    pendingFileRef.current = null
    if (!si || !file) {
      setMsg('Carga cancelada. Se conservó el video existente.')
      setFase('')
      return
    }
    subirArchivo(file)
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
    fd.append('file', file, file.name || 'capacitacion.mp4')

    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr
    xhr.open('POST', `${API_BASE}${MAPA_NAVEGACION_API_URL}/video`)
    if (tok) xhr.setRequestHeader('Authorization', `Bearer ${tok}`)
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return
      setProgreso(Math.min(99, Math.round((ev.loaded / ev.total) * 100)))
    }
    xhr.onload = () => {
      xhrRef.current = null
      setBusy(false)
      let data = null
      try { data = JSON.parse(xhr.responseText || '{}') } catch { data = null }
      if (xhr.status >= 200 && xhr.status < 300 && data?.ok) {
        setFase('listo')
        setProgreso(100)
        setMsg('Video guardado.')
        if (data.contenido) onContenidoActualizado?.(data.contenido)
        window.setTimeout(() => resetMsg(), 1200)
        return
      }
      setFase('error')
      setMsg(detalleErrorApi(data, `No se pudo cargar el video (error ${xhr.status}).`))
    }
    xhr.onerror = () => {
      xhrRef.current = null
      setBusy(false)
      setFase('error')
      setMsg('Error de red al subir el video. Verifique la conexión e intente de nuevo.')
    }
    xhr.onabort = () => {
      xhrRef.current = null
      setBusy(false)
      setFase('')
      setProgreso(0)
      setMsg('Carga cancelada.')
    }
    xhr.send(fd)
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
      if (!r.ok) throw new Error(detalleErrorApi(data, 'No se pudo eliminar'))
      if (data.contenido) onContenidoActualizado?.(data.contenido)
      setMsg('Video eliminado.')
      setFase('')
    } catch (e) {
      setFase('error')
      setMsg(e.message || 'No se pudo eliminar el video.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title={tieneVideo ? 'Reemplazar video de capacitación' : 'Cargar video de capacitación'}
          aria-label={tieneVideo ? 'Reemplazar video de capacitación' : 'Cargar video de capacitación'}
          disabled={busy}
          onClick={elegirArchivo}
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

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_VIDEO}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) onArchivoElegido(f)
          }}
        />
      </div>

      {(fase === 'subiendo' || fase === 'listo' || fase === 'error' || msg) ? (
        <div
          style={{
            marginTop: 6,
            width: '100%',
            minWidth: 120,
            maxWidth: 220,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {fase === 'subiendo' ? (
            <div>
              <div style={{
                height: 6,
                borderRadius: 99,
                background: t.border,
                overflow: 'hidden',
              }}
              >
                <div style={{
                  width: `${progreso}%`,
                  height: '100%',
                  background: t.primary,
                  transition: 'width 160ms ease',
                }}
                />
              </div>
              <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 4 }}>
                Subiendo… {progreso}%
              </div>
            </div>
          ) : null}
          {msg ? (
            <div style={{
              fontSize: 'var(--cc-caption)',
              color: fase === 'error' ? '#dc2626' : t.textMuted,
              lineHeight: 1.35,
            }}
            >
              {msg}
            </div>
          ) : null}
          {fase === 'subiendo' ? (
            <button
              type="button"
              onClick={() => { detenerXhr(); setBusy(false); setFase(''); setProgreso(0); setMsg('Carga cancelada.') }}
              style={{
                marginTop: 4,
                border: 'none',
                background: 'transparent',
                color: t.primary,
                cursor: 'pointer',
                fontSize: 'var(--cc-caption)',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Cancelar
            </button>
          ) : null}
        </div>
      ) : null}

      {confirmReplace ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar reemplazo de video"
          onClick={(e) => {
            e.stopPropagation()
            confirmarReemplazo(false)
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
              width: 'min(380px, 96vw)',
              borderRadius: 14,
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              color: t.text,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm)' }}>
              ¿Desea reemplazar el video?
            </div>
            <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.4 }}>
              {tema?.nombre
                ? `La tarjeta «${tema.nombre}» ya tiene un video. Si continúa, se reemplazará por el nuevo.`
                : 'Esta tarjeta ya tiene un video. Si continúa, se reemplazará por el nuevo.'}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => confirmarReemplazo(false)}
                style={{
                  minHeight: 40,
                  minWidth: 72,
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.bg,
                  color: t.text,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => confirmarReemplazo(true)}
                style={{
                  minHeight: 40,
                  minWidth: 72,
                  borderRadius: 8,
                  border: 'none',
                  background: t.primary,
                  color: '#fff',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Sí
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
