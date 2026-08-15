import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../../apiBase'
import { prepararImagenParaUpload } from '../../comprimirImagen'
import {
  MAPA_NAVEGACION_API_URL,
  MAPA_NAVEGACION_MODULOS,
  MAPA_NAVEGACION_STATIC_URL,
} from './mapaNavegacionCatalogo'
import {
  contenidoEditableCompleto,
  fusionarMapaNavegacion,
  normalizarContenidoMapa,
} from './mapaNavegacionMerge'
import MapaNavegacionVista from './MapaNavegacionVista'

function getToken(tokenProp) {
  return tokenProp || localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token') || ''
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts)
  const text = await r.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!r.ok) {
    const detail = data?.detail || data?.message || text || r.statusText
    throw new Error(typeof detail === 'string' ? detail : `Error ${r.status}`)
  }
  return data
}

/**
 * Carga única fuente de verdad del mapa:
 * 1) API (contenido publicado en blob / seed)
 * 2) JSON estático en /public/ayuda
 */
export async function cargarContenidoMapaNavegacion(token) {
  const tok = getToken(token)
  try {
    const data = await fetchJson(`${API_BASE}${MAPA_NAVEGACION_API_URL}`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    })
    return {
      contenido: normalizarContenidoMapa(data?.contenido || data),
      fuente: data?.fuente === 'blob' ? 'API (publicado)' : 'API (catálogo)',
      puedeEditar: !!data?.puede_editar,
    }
  } catch {
    const data = await fetchJson(MAPA_NAVEGACION_STATIC_URL)
    return {
      contenido: normalizarContenidoMapa(data),
      fuente: 'archivo estático',
      puedeEditar: false,
    }
  }
}

function EditorMapa({ t, draft, setDraft, onGuardar, onSubirImagen, guardando, msg }) {
  const [modId, setModId] = useState(MAPA_NAVEGACION_MODULOS[0]?.id || '')
  const actual = draft.modulos[modId] || { descripcion: '', imagenes: [] }

  return (
    <div style={{
      marginBottom: 16,
      padding: 14,
      borderRadius: 12,
      border: `1px solid ${t.border}`,
      background: t.bgCard,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ fontWeight: 800, color: t.primary, fontSize: 'var(--cc-sm)' }}>
        Editar contenido del mapa (Desarrollador)
      </div>
      <p style={{ margin: 0, fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.4 }}>
        Actualiza descripción y pantallazos sin tocar código. Al guardar se publica en el API
        (Azure Blob). También puedes editar <code>/ayuda/mapa-navegacion.json</code> en el repo.
      </p>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-sm)', color: t.text }}>
        Módulo
        <select
          value={modId}
          onChange={(e) => setModId(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid ${t.border}`,
            background: t.bg,
            color: t.text,
            fontSize: 16,
          }}
        >
          {MAPA_NAVEGACION_MODULOS.map((m) => (
            <option key={m.id} value={m.id}>{m.icono} {m.nombre}</option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-sm)', color: t.text }}>
        Descripción educativa
        <textarea
          value={actual.descripcion || ''}
          rows={5}
          onChange={(e) => {
            const descripcion = e.target.value
            setDraft((prev) => ({
              ...prev,
              modulos: {
                ...prev.modulos,
                [modId]: { ...prev.modulos[modId], descripcion },
              },
            }))
          }}
          placeholder="Qué es y para qué sirve este módulo, en lenguaje simple…"
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid ${t.border}`,
            background: t.bg,
            color: t.text,
            fontSize: 'var(--cc-sm)',
            lineHeight: 1.45,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.text }}>Pantallazos</div>
        {(actual.imagenes || []).map((img, idx) => (
          <div key={`${modId}-e-${idx}`} style={{
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
            padding: 8, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg,
          }}>
            <img src={img.url} alt="" style={{ width: 72, height: 48, objectFit: 'cover', borderRadius: 6 }} />
            <input
              value={img.caption || ''}
              placeholder="Pie de imagen (opcional)"
              onChange={(e) => {
                const caption = e.target.value
                setDraft((prev) => {
                  const imagenes = [...(prev.modulos[modId]?.imagenes || [])]
                  imagenes[idx] = { ...imagenes[idx], caption }
                  return {
                    ...prev,
                    modulos: { ...prev.modulos, [modId]: { ...prev.modulos[modId], imagenes } },
                  }
                })
              }}
              style={{
                flex: '1 1 160px',
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: t.bgCard,
                color: t.text,
                fontSize: 'var(--cc-sm)',
              }}
            />
            <button
              type="button"
              onClick={() => {
                setDraft((prev) => {
                  const imagenes = (prev.modulos[modId]?.imagenes || []).filter((_, i) => i !== idx)
                  return {
                    ...prev,
                    modulos: { ...prev.modulos, [modId]: { ...prev.modulos[modId], imagenes } },
                  }
                })
              }}
              style={{
                border: `1px solid ${t.border}`,
                background: 'transparent',
                color: t.textMuted,
                borderRadius: 8,
                padding: '8px 10px',
                cursor: 'pointer',
                fontSize: 'var(--cc-sm)',
              }}
            >
              Quitar
            </button>
          </div>
        ))}
        <label style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          alignSelf: 'flex-start',
          padding: '10px 12px',
          borderRadius: 8,
          border: `1px dashed ${t.border}`,
          cursor: 'pointer',
          fontSize: 'var(--cc-sm)',
          color: t.primary,
          fontWeight: 700,
        }}>
          + Subir pantallazo
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              const url = await onSubirImagen(file)
              if (!url) return
              setDraft((prev) => {
                const imagenes = [...(prev.modulos[modId]?.imagenes || []), { url, caption: '' }]
                return {
                  ...prev,
                  modulos: { ...prev.modulos, [modId]: { ...prev.modulos[modId], imagenes } },
                }
              })
            }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          disabled={guardando}
          onClick={onGuardar}
          style={{
            background: t.primary,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            fontWeight: 700,
            cursor: guardando ? 'wait' : 'pointer',
            opacity: guardando ? 0.7 : 1,
            fontSize: 'var(--cc-sm)',
          }}
        >
          {guardando ? 'Guardando…' : 'Publicar contenido'}
        </button>
        {msg ? <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>{msg}</span> : null}
      </div>
    </div>
  )
}

/**
 * Módulo completo (menú lateral) o embebido (panel Clara).
 */
export default function ModuloMapaNavegacion({
  t,
  token,
  usuario,
  compact = false,
  showEditor = true,
}) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [fuente, setFuente] = useState('')
  const [contenido, setContenido] = useState(() => contenidoEditableCompleto(null))
  const [editando, setEditando] = useState(false)
  const [draft, setDraft] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')

  const esDev = (usuario?.cargo_nombre || '').trim().toLowerCase() === 'desarrollador'
  const puedeEditar = showEditor && esDev

  const recargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const { contenido: c, fuente: f } = await cargarContenidoMapaNavegacion(token)
      const full = contenidoEditableCompleto(c)
      setContenido(full)
      setFuente(f)
    } catch (e) {
      setError(e.message || 'No se pudo cargar el mapa de navegación.')
      setContenido(contenidoEditableCompleto(null))
      setFuente('')
    } finally {
      setCargando(false)
    }
  }, [token])

  useEffect(() => { void recargar() }, [recargar])

  const vista = useMemo(() => fusionarMapaNavegacion(contenido), [contenido])

  async function guardar() {
    if (!draft) return
    setGuardando(true)
    setMsg('')
    try {
      const tok = getToken(token)
      const body = {
        version: 1,
        modulos: draft.modulos,
      }
      const data = await fetchJson(`${API_BASE}${MAPA_NAVEGACION_API_URL}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: JSON.stringify(body),
      })
      const full = contenidoEditableCompleto(data?.contenido || body)
      setContenido(full)
      setDraft(full)
      setFuente('API (publicado)')
      setMsg('Contenido publicado.')
    } catch (e) {
      setMsg(e.message || 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function subirImagen(file) {
    setMsg('')
    try {
      const prepared = await prepararImagenParaUpload(file)
      const fd = new FormData()
      fd.append('file', prepared, prepared.name || 'pantallazo.jpg')
      const tok = getToken(token)
      const data = await fetchJson(`${API_BASE}${MAPA_NAVEGACION_API_URL}/imagen`, {
        method: 'POST',
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        body: fd,
      })
      return data?.url || ''
    } catch (e) {
      setMsg(e.message || 'No se pudo subir la imagen.')
      return ''
    }
  }

  return (
    <div style={{
      height: compact ? '100%' : 'auto',
      maxHeight: compact ? '100%' : undefined,
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      padding: compact ? '10px 12px 16px' : '4px 2px 24px',
      boxSizing: 'border-box',
    }}>
      {!compact && puedeEditar && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => {
              if (!editando) {
                setDraft(contenidoEditableCompleto(contenido))
                setMsg('')
              }
              setEditando((v) => !v)
            }}
            style={{
              background: editando ? `${t.primary}22` : 'transparent',
              border: `1px solid ${t.border}`,
              color: t.primary,
              borderRadius: 8,
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 'var(--cc-sm)',
            }}
          >
            {editando ? 'Cerrar editor' : '✏️ Editar contenido'}
          </button>
        </div>
      )}

      {editando && draft && (
        <EditorMapa
          t={t}
          draft={draft}
          setDraft={setDraft}
          onGuardar={guardar}
          onSubirImagen={subirImagen}
          guardando={guardando}
          msg={msg}
        />
      )}

      <MapaNavegacionVista
        t={t}
        grupos={vista.grupos}
        compact={compact}
        cargando={cargando}
        error={error}
        fuente={fuente}
      />
    </div>
  )
}
