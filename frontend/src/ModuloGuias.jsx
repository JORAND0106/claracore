import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import { API_BASE } from './apiBase'

const API = API_BASE
const API_FALLBACK = 'https://claracore-backend.azurewebsites.net'

const MODULOS_OPCIONES = [
  'Inicio',
  'Dashboard',
  'SICOE Obra',
  'Presupuesto',
  'Informes',
  'Administración',
  'General',
]

function slugPreview(titulo) {
  const t = (titulo || '').trim().toLowerCase()
  let s = t.replace(/\s+/g, '-').replace(/[^a-z0-9\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return s || 'guia'
}

function letraGlosario(titulo) {
  const t = (titulo || '').trim()
  if (!t) return '#'
  const x = t.charAt(0)
  if (/[0-9]/.test(x)) return '#'
  return x.toUpperCase()
}

function agruparAZ(items) {
  const map = new Map()
  for (const g of items) {
    const L = letraGlosario(g.titulo)
    if (!map.has(L)) map.set(L, [])
    map.get(L).push(g)
  }
  const letters = [...map.keys()].sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }),
  )
  return letters.map((letter) => ({
    letter,
    rows: map.get(letter),
  }))
}

/** Bloques por defecto JSON */
function bloqueVacio(tipo) {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `bk-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  if (tipo === 'texto') return { _key: id, tipo: 'texto', contenido: '' }
  if (tipo === 'subtitulo') return { _key: id, tipo: 'subtitulo', contenido: '' }
  return { _key: id, tipo: 'imagen', url: '', caption: '' }
}

/**
 * Agrupa bloques para la lectura: sección (subtítulo + párrafos siguientes),
 * párrafos iniciales sin subtítulo, e imagen + pie como tarjeta propia.
 */
function buildGuiaBlockGroups(bloques) {
  const arr = Array.isArray(bloques) ? bloques : []
  const groups = []
  let i = 0
  while (i < arr.length) {
    const raw = arr[i]
    const tipo = (raw && raw.tipo) || 'texto'
    if (tipo === 'imagen') {
      groups.push({ kind: 'media', block: raw })
      i++
      continue
    }
    if (tipo === 'subtitulo') {
      const title = raw.contenido || ''
      i++
      const paragraphs = []
      while (i < arr.length) {
        const t2 = (arr[i] && arr[i].tipo) || 'texto'
        if (t2 !== 'texto') break
        paragraphs.push(arr[i])
        i++
      }
      groups.push({ kind: 'section', title, paragraphs })
      continue
    }
    const paragraphs = []
    while (i < arr.length) {
      const t2 = (arr[i] && arr[i].tipo) || 'texto'
      if (t2 !== 'texto') break
      paragraphs.push(arr[i])
      i++
    }
    if (paragraphs.length) groups.push({ kind: 'prose', paragraphs })
  }
  return groups
}

/** Ancla por bloque agrupado (p. ej. enlaces profundos #guia-bloque-0). */
function anchorIdGuiaGrupo(gi) {
  return `guia-bloque-${gi}`
}

function numeroSeccionParaGrupo(grupos, gi) {
  if (!grupos[gi] || grupos[gi].kind !== 'section') return null
  let n = 0
  for (let i = 0; i <= gi; i++) {
    if (grupos[i]?.kind === 'section') n += 1
  }
  return n
}

function renderGuiaGrupo(t, grupos, g, gi) {
  const nid = anchorIdGuiaGrupo(gi)
  if (g.kind === 'section') {
    const n = numeroSeccionParaGrupo(grupos, gi) || 0
    return (
      <article
        id={nid}
        style={{
          marginBottom: 'var(--cc-space-4)',
          borderRadius: '14px',
          border: `1px solid ${t.border}`,
          overflow: 'hidden',
          background: t.bgCard,
          boxShadow: `0 6px 24px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.45)`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: 'var(--cc-space-3) var(--cc-space-3)',
            background: `linear-gradient(100deg, ${t.primary}12 0%, ${t.primaryLight || t.primary}0f 52%, transparent 100%)`,
            borderLeft: `4px solid ${t.primary}`,
          }}
        >
          <span
            aria-hidden
            style={{
              flexShrink: 0,
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: `linear-gradient(145deg, ${t.primary}, ${t.primaryLight || t.primary})`,
              color: '#fff',
              fontSize: 'var(--cc-sm)',
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 4px 12px ${t.primary}55`,
            }}
          >
            {n}
          </span>
          <h3
            style={{
              margin: '2px 0 0',
              fontSize: 'var(--cc-lg)',
              fontWeight: '800',
              color: t.primary,
              lineHeight: 1.35,
            }}
          >
            {g.title}
          </h3>
        </div>
        {g.paragraphs.length > 0 ? (
          <div style={{ padding: '0 var(--cc-space-3) var(--cc-space-3)' }}>
            {g.paragraphs.map((p, pi) => (
              <p
                key={pi}
                style={{
                  fontSize: 'var(--cc-body)',
                  color: t.text,
                  lineHeight: 1.65,
                  whiteSpace: 'pre-wrap',
                  margin: pi > 0 ? 'var(--cc-space-3) 0 0' : 0,
                }}
              >
                {p.contenido || ''}
              </p>
            ))}
          </div>
        ) : null}
      </article>
    )
  }
  if (g.kind === 'prose') {
    return (
      <div
        id={nid}
        style={{
          marginBottom: 'var(--cc-space-4)',
          padding: 'var(--cc-space-3)',
          borderRadius: '12px',
          background: `${t.primary}0a`,
          border: `1px dashed ${t.border}`,
        }}
      >
        {g.paragraphs.map((p, pi) => (
          <p
            key={pi}
            style={{
              fontSize: 'var(--cc-body)',
              color: t.text,
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              margin: pi > 0 ? 'var(--cc-space-3) 0 0' : 0,
            }}
          >
            {p.contenido || ''}
          </p>
        ))}
      </div>
    )
  }
  const b = g.block
  const hasUrl = b && b.url
  return (
    <figure
      id={nid}
      style={{
        margin: '0 0 var(--cc-space-4)',
        borderRadius: '16px',
        overflow: 'hidden',
        border: `1px solid ${t.border}`,
        background: t.bgCard,
        boxShadow: `0 10px 40px rgba(0,0,0,0.08), 0 0 0 1px ${t.primary}12`,
      }}
    >
      <div
        style={{
          padding: 'var(--cc-space-2)',
          background: `linear-gradient(180deg, ${t.primary}18, ${t.primary}06 40%, transparent)`,
        }}
      >
        {hasUrl ? (
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir imagen en una pestaña nueva (zoom del navegador)"
            aria-label={`Abrir imagen en tamaño completo: ${b.caption || b.url || 'imagen de la guía'}`}
            style={{
              display: 'block',
              lineHeight: 0,
              borderRadius: '10px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <img
              src={b.url}
              alt={b.caption || 'Ilustración de la guía'}
              style={{
                display: 'block',
                width: '100%',
                maxHeight: 'min(38vh, 320px)',
                objectFit: 'contain',
                borderRadius: '10px',
                background: t.bg,
                pointerEvents: 'none',
              }}
            />
          </a>
        ) : (
          <div
            style={{
              padding: 'var(--cc-space-5)',
              textAlign: 'center',
              color: t.textMuted,
              fontSize: 'var(--cc-sm)',
              borderRadius: '10px',
              background: t.bg,
            }}
          >
            Sin URL de imagen
          </div>
        )}
      </div>
      {b && b.caption ? (
        <figcaption
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: 'var(--cc-space-2) var(--cc-space-3)',
            fontSize: 'var(--cc-sm)',
            color: t.textMuted,
            lineHeight: 1.5,
            background: `linear-gradient(90deg, ${t.primary}10, transparent)`,
            borderTop: `1px solid ${t.border}`,
          }}
        >
          <span aria-hidden style={{ fontSize: 'var(--cc-md)', lineHeight: 1 }}>
            🖼️
          </span>
          <span style={{ fontStyle: 'italic' }}>{b.caption}</span>
        </figcaption>
      ) : null}
    </figure>
  )
}

function withStableBlockKeys(bloques) {
  return (Array.isArray(bloques) ? bloques : []).map((b) => ({
    ...b,
    _key:
      b._key ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `bk-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`),
  }))
}

function stripBlockKeysForApi(bloques) {
  return (Array.isArray(bloques) ? bloques : []).map((b) => {
    const { _key: _k, ...rest } = b
    return rest
  })
}

/** Cabecera de guía (lectura / vista previa editor) */
function GuiaPreviewCabecera({ t, titulo, modulo, descripcionCorta, titleId }) {
  return (
    <header
      style={{
        flexShrink: 0,
        padding: 'var(--cc-space-4) var(--cc-space-4) var(--cc-space-3)',
        background: `linear-gradient(145deg, ${t.primary}14 0%, ${t.primaryLight || t.primary}22 42%, ${t.bgCard} 88%)`,
        borderBottom: `1px solid ${t.border}`,
        position: 'relative',
        borderRadius: '12px 12px 0 0',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: `linear-gradient(90deg, ${t.primary}, ${t.primaryLight || t.primary}, ${t.primary})`,
          opacity: 0.95,
          borderRadius: '12px 12px 0 0',
        }}
      />
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: 'var(--cc-caption)',
          fontWeight: '800',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: t.primary,
          marginBottom: '8px',
          background: `${t.primary}14`,
          padding: '4px 10px',
          borderRadius: '999px',
          border: `1px solid ${t.primary}35`,
        }}
      >
        <span aria-hidden>📌</span>
        {modulo || 'General'}
      </div>
      <h2
        id={titleId}
        style={{
          margin: '0 0 8px',
          fontSize: 'var(--cc-h2)',
          fontWeight: '800',
          color: t.text,
          lineHeight: 1.25,
          letterSpacing: '-0.02em',
        }}
      >
        {titulo || 'Sin título'}
      </h2>
      {descripcionCorta ? (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--cc-md)',
            color: t.textMuted,
            lineHeight: 1.55,
            maxWidth: '62ch',
            borderLeft: `3px solid ${t.primary}`,
            paddingLeft: '12px',
          }}
        >
          {descripcionCorta}
        </p>
      ) : null}
    </header>
  )
}

/** Cuerpo con tarjetas agrupadas (ids `guia-bloque-N` por si más adelante enlazamos secciones). */
function GuiaCuerpoBloques({ t, bloques, showEmptyHint = true, emptyHintText }) {
  const shellStyle = {
    padding: 'var(--cc-space-3) var(--cc-space-4) var(--cc-space-4)',
    background: t.bg && t.bg !== t.bgCard ? `linear-gradient(180deg, ${t.bg} 0%, ${t.bgCard} 24%)` : t.bgCard,
    borderRadius: '0 0 12px 12px',
  }
  const grupos = buildGuiaBlockGroups(bloques)

  if (!grupos.length && showEmptyHint) {
    return (
      <div style={shellStyle}>
        <p style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, textAlign: 'center', margin: 'var(--cc-space-3) 0' }}>
          {emptyHintText ||
            'Añade bloques a la izquierda: verás aquí el resultado al instante.'}
        </p>
      </div>
    )
  }

  return (
    <div style={shellStyle}>
      {grupos.map((g, gi) => (
        <Fragment key={gi}>{renderGuiaGrupo(t, grupos, grupos[gi], gi)}</Fragment>
      ))}
    </div>
  )
}

export default function ModuloGuias({ t, usuario, token, s, fontSize = 'normal' }) {
  const esDesarrollador = (usuario?.cargo_nombre || '').toLowerCase().trim() === 'desarrollador'

  const getAuthToken = () =>
    token ||
    localStorage.getItem('cc_token') ||
    sessionStorage.getItem('cc_token') ||
    localStorage.getItem('token') ||
    localStorage.getItem('access_token') ||
    ''

  const toPath = (pathOrUrl) => {
    if (!pathOrUrl) return ''
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      try {
        const u = new URL(pathOrUrl)
        return `${u.pathname}${u.search || ''}`
      } catch {
        return pathOrUrl
      }
    }
    return pathOrUrl
  }

  const fetchConFallback = useCallback(async (pathOrUrl, options = {}) => {
    const path = toPath(pathOrUrl)
    const principal = path.startsWith('http') ? path : `${API}${path}`
    try {
      return await fetch(principal, options)
    } catch (e) {
      const esErrorRed = e instanceof TypeError || String(e?.message || '').toLowerCase().includes('failed to fetch')
      if (!esErrorRed || API === API_FALLBACK) throw e
      const alterna = path.startsWith('http') ? path.replace(API, API_FALLBACK) : `${API_FALLBACK}${path}`
      return await fetch(alterna, options)
    }
  }, [])

  const [guias, setGuias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [detalleSlug, setDetalleSlug] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  /** modal crear/editar */
  const [formAbierto, setFormAbierto] = useState(false)
  const [formModo, setFormModo] = useState('crear')
  const [formId, setFormId] = useState(null)
  const [formTitulo, setFormTitulo] = useState('')
  const [formModulo, setFormModulo] = useState(MODULOS_OPCIONES[0])
  const [formDesc, setFormDesc] = useState('')
  const [formBloques, setFormBloques] = useState([])
  const [formRolesIds, setFormRolesIds] = useState([])
  const [formPublicado, setFormPublicado] = useState(false)
  const [formOrden, setFormOrden] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [catalogoRoles, setCatalogoRoles] = useState([])
  const [eliminarId, setEliminarId] = useState(null)

  const [listaTick, setListaTick] = useState(0)
  const [formBloqueFocusIdx, setFormBloqueFocusIdx] = useState(null)
  const [dragBloqueIdx, setDragBloqueIdx] = useState(null)
  const [editorSplit, setEditorSplit] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 920,
  )
  const [uploadingBloqueIdx, setUploadingBloqueIdx] = useState(null)
  const [archivoPickIdx, setArchivoPickIdx] = useState(null)
  const archivoGuiaInputRef = useRef(null)
  const formBloquesRef = useRef([])

  useEffect(() => {
    const fn = () => setEditorSplit(window.innerWidth >= 920)
    fn()
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => {
    fetchConFallback('/roles', {})
      .then((r) => (r.ok ? r.json() : []))
      .then(setCatalogoRoles)
      .catch(() => setCatalogoRoles([]))
  }, [fetchConFallback])

  useEffect(() => {
    let cancel = false
    const auth = getAuthToken()
    if (!auth) {
      setGuias([])
      setCargando(false)
      return undefined
    }
    const q = busqueda.trim()
    const path = !q
      ? esDesarrollador
        ? '/guias/admin/todas'
        : '/guias'
      : `/guias/buscar?q=${encodeURIComponent(q)}`

    setCargando(true)
    setError(null)
    fetchConFallback(path, { headers: { Authorization: `Bearer ${auth}` } })
      .then(async (r) => {
        if (cancel) return
        if (!r.ok) {
          const txt = await r.text().catch(() => '')
          throw new Error(txt || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((data) => {
        if (!cancel) setGuias(Array.isArray(data) ? data : [])
      })
      .catch((e) => {
        if (!cancel) {
          setError(String(e?.message || e))
          setGuias([])
        }
      })
      .finally(() => {
        if (!cancel) setCargando(false)
      })
    return () => {
      cancel = true
    }
  }, [busqueda, esDesarrollador, fetchConFallback, listaTick])

  formBloquesRef.current = formBloques

  const subirArchivoGuiaBloque = useCallback(
    async (file, idx) => {
      if (!file || !file.type.startsWith('image/')) {
        setError('Usa un archivo de imagen (PNG, JPEG, WebP o GIF).')
        return
      }
      const auth = getAuthToken()
      if (!auth) return
      setUploadingBloqueIdx(idx)
      setError(null)
      try {
        const fd = new FormData()
        fd.append('file', file)
        const r = await fetchConFallback('/guias/imagen', {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth}` },
          body: fd,
        })
        const raw = await r.text()
        if (!r.ok) {
          let msg = raw
          try {
            const j = JSON.parse(raw)
            msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail || j)
          } catch {
            /* ignore */
          }
          throw new Error(msg)
        }
        const data = JSON.parse(raw)
        const url = data.url
        if (!url) throw new Error('El servidor no devolvió URL')
        setFormBloques((prev) => {
          const next = [...prev]
          if (!next[idx]) return prev
          next[idx] = { ...next[idx], url }
          return next
        })
      } catch (e) {
        setError(String(e?.message || e))
      } finally {
        setUploadingBloqueIdx(null)
      }
    },
    [fetchConFallback],
  )

  useEffect(() => {
    if (!formAbierto) return undefined
    const onPaste = (e) => {
      const idx = formBloqueFocusIdx
      if (idx == null) return
      const bl = formBloquesRef.current[idx]
      if (!bl || bl.tipo !== 'imagen') return
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          e.preventDefault()
          const f = it.getAsFile()
          if (f) subirArchivoGuiaBloque(f, idx)
          break
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [formAbierto, formBloqueFocusIdx, subirArchivoGuiaBloque])

  async function pegarImagenDesdeClipboard(idx) {
    try {
      const clip = await navigator.clipboard.read()
      for (const item of clip) {
        for (const ty of item.types) {
          if (ty.startsWith('image/')) {
            const blob = await item.getType(ty)
            const ext = ty.includes('png') ? 'png' : 'jpg'
            const file = new File([blob], `captura.${ext}`, { type: blob.type || ty || 'image/png' })
            await subirArchivoGuiaBloque(file, idx)
            return
          }
        }
      }
      setError('El portapapeles no tiene una imagen. Copia una captura o imagen primero.')
    } catch {
      setError(
        'No se pudo leer el portapapeles. Prueba Ctrl+V con el bloque imagen seleccionado o «Elegir archivo».',
      )
    }
  }

  function abrirSelectorArchivoGuia(idx) {
    setArchivoPickIdx(idx)
    requestAnimationFrame(() => archivoGuiaInputRef.current?.click())
  }

  const grupos = useMemo(() => agruparAZ(guias), [guias])

  function abrirNueva() {
    setFormModo('crear')
    setFormId(null)
    setFormTitulo('')
    setFormModulo(MODULOS_OPCIONES[0])
    setFormDesc('')
    setFormBloques([])
    setFormRolesIds([])
    setFormPublicado(false)
    setFormOrden(0)
    setFormBloqueFocusIdx(null)
    setDragBloqueIdx(null)
    setFormAbierto(true)
  }

  function abrirEditar(g) {
    setFormModo('editar')
    setFormId(g.id)
    setFormTitulo(g.titulo || '')
    setFormModulo(g.modulo || MODULOS_OPCIONES[0])
    setFormDesc(g.descripcion_corta || '')
    const bl = g.bloques
    setFormBloques(withStableBlockKeys(Array.isArray(bl) ? [...bl] : []))
    const rv = g.roles_visibles
    setFormRolesIds(Array.isArray(rv) ? rv.map((x) => Number(x)) : [])
    setFormPublicado(!!g.publicado)
    setFormOrden(g.orden != null ? Number(g.orden) : 0)
    setFormBloqueFocusIdx(null)
    setDragBloqueIdx(null)
    setFormAbierto(true)
  }

  function mueveBloqueDesdeHasta(from, to) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return
    let insertAt = to
    if (from < to) insertAt = to - 1
    setFormBloques((prev) => {
      const n = [...prev]
      const [el] = n.splice(from, 1)
      n.splice(insertAt, 0, el)
      return n
    })
    setFormBloqueFocusIdx(insertAt)
  }

  async function guardarForm() {
    const auth = getAuthToken()
    if (!auth || !formTitulo.trim()) return
    setGuardando(true)
    setError(null)
    try {
      const payload = {
        titulo: formTitulo.trim(),
        modulo: formModulo || null,
        descripcion_corta: formDesc.trim() || null,
        bloques: stripBlockKeysForApi(formBloques),
        roles_visibles: formRolesIds,
        publicado: formPublicado,
        orden: formOrden,
        contrato_id: null,
      }
      const url = formModo === 'crear' ? '/guias' : `/guias/${formId}`
      const method = formModo === 'crear' ? 'POST' : 'PUT'
      const r = await fetchConFallback(url, {
        method,
        headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const txt = await r.text()
        let msg = txt
        try {
          const j = JSON.parse(txt)
          msg = j.detail || txt
        } catch { /* ignore */ }
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }
      setFormAbierto(false)
      setListaTick((x) => x + 1)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarEliminar() {
    if (!eliminarId) return
    const auth = getAuthToken()
    if (!auth) return
    setGuardando(true)
    setError(null)
    try {
      const r = await fetchConFallback(`/guias/${eliminarId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth}` },
      })
      if (!r.ok) {
        const txt = await r.text()
        throw new Error(txt || `HTTP ${r.status}`)
      }
      setEliminarId(null)
      setDetalleSlug(null)
      setDetalle(null)
      setListaTick((x) => x + 1)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  async function abrirDetalle(slug) {
    const auth = getAuthToken()
    if (!auth) return
    setDetalleSlug(slug)
    setCargandoDetalle(true)
    setDetalle(null)
    try {
      const r = await fetchConFallback(`/guias/${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${auth}` },
      })
      if (!r.ok) throw new Error('No se pudo cargar la guía')
      setDetalle(await r.json())
    } catch (e) {
      setError(String(e?.message || e))
      setDetalleSlug(null)
    } finally {
      setCargandoDetalle(false)
    }
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--cc-space-3)',
          marginBottom: 'var(--cc-space-5)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--cc-h1)', fontWeight: '800', color: t.text }}>Guías y documentación</h1>
          <p style={{ margin: '6px 0 0', fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            Manuales de usuario integrados en ClaraCore
          </p>
        </div>
        {esDesarrollador && (
          <button type="button" onClick={abrirNueva} style={s.btnCrear}>
            + Nueva guía
          </button>
        )}
      </div>

      <div style={{ marginBottom: 'var(--cc-space-4)' }}>
        <label style={s.label}>BUSCAR</label>
        <input
          style={s.input}
          placeholder="Palabra clave en título o descripción…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {error && (
        <div
          style={{
            background: '#FEE2E2',
            color: '#B91C1C',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: 'var(--cc-sm)',
            marginBottom: 'var(--cc-space-4)',
          }}
        >
          {error}
        </div>
      )}

      {cargando && (
        <div style={{ ...s.emptyState, fontSize: 'var(--cc-body)' }}>Cargando guías…</div>
      )}

      {!cargando && guias.length === 0 && (
        <div style={s.emptyState}>No hay guías que coincidan con tu búsqueda o permisos.</div>
      )}

      {!cargando &&
        grupos.map(({ letter, rows }) => (
          <section key={letter} style={{ marginBottom: 'var(--cc-space-6)' }}>
            <div
              style={{
                fontSize: 'var(--cc-lg)',
                fontWeight: '800',
                color: t.primary,
                marginBottom: 'var(--cc-space-3)',
                borderBottom: `2px solid ${t.border}`,
                paddingBottom: '6px',
              }}
            >
              {letter}
            </div>
            <nav aria-label={`Guías que empiezan por ${letter}`}>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: 'min(720px, 100%)' }}>
                {rows.map((g) => (
                  <li
                    key={g.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 0',
                      borderBottom: `1px solid ${t.border}`,
                    }}
                  >
                    <span aria-hidden style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', flexShrink: 0, width: '1.25em' }}>
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => abrirDetalle(g.slug)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        padding: '2px 0',
                        cursor: 'pointer',
                        fontSize: 'var(--cc-body)',
                        fontWeight: '600',
                        color: t.primary,
                        lineHeight: 1.45,
                        textDecoration: 'underline',
                        textDecorationColor: `${t.primary}55`,
                        textUnderlineOffset: '3px',
                      }}
                    >
                      {g.titulo || 'Sin título'}
                    </button>
                    {esDesarrollador && !g.publicado ? (
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: '10px',
                          fontWeight: '700',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: t.textMuted,
                        }}
                      >
                        Borrador
                      </span>
                    ) : null}
                    {esDesarrollador ? (
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => abrirEditar(g)}
                          style={{
                            background: t.bg,
                            border: `1px solid ${t.border}`,
                            borderRadius: '6px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: 'var(--cc-caption)',
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() => setEliminarId(g.id)}
                          style={{
                            background: t.bg,
                            border: `1px solid ${t.border}`,
                            borderRadius: '6px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: 'var(--cc-caption)',
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </nav>
          </section>
        ))}

      {/* Modal lectura — shell editorial: cabecera, cuerpo con scroll, bloques agrupados */}
      {detalleSlug && (
        <div
          style={{
            ...s.overlay,
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
          onClick={() => { setDetalleSlug(null); setDetalle(null) }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="guia-lectura-titulo"
            style={{
              background: t.bgCard,
              borderRadius: '18px',
              border: `1px solid ${t.border}`,
              width: 'min(1000px, 96vw)',
              maxWidth: '1000px',
              maxHeight: 'min(92vh, 880px)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: `0 24px 64px rgba(0,0,0,0.22), 0 0 0 1px ${t.primary}18, 0 -2px 24px ${t.primaryLight || t.primary}22`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {cargandoDetalle && (
              <div
                style={{
                  padding: 'var(--cc-space-6)',
                  textAlign: 'center',
                  fontSize: 'var(--cc-body)',
                  color: t.textMuted,
                }}
              >
                <span style={{ display: 'inline-block', marginRight: '10px', opacity: 0.65 }}>⏳</span>
                Cargando guía…
              </div>
            )}
            {!cargandoDetalle && detalle && (
              <>
                <GuiaPreviewCabecera
                  t={t}
                  titulo={detalle.titulo}
                  modulo={detalle.modulo}
                  descripcionCorta={detalle.descripcion_corta}
                  titleId="guia-lectura-titulo"
                />
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                  }}
                >
                  <GuiaCuerpoBloques
                    t={t}
                    bloques={detalle.bloques}
                    showEmptyHint
                    emptyHintText="Esta guía aún no tiene bloques de contenido."
                  />
                </div>

                {/* Pie */}
                <footer
                  style={{
                    flexShrink: 0,
                    padding: 'var(--cc-space-4) var(--cc-space-5)',
                    borderTop: `1px solid ${t.border}`,
                    background: `linear-gradient(180deg, ${t.bgCard}, ${t.primary}08)`,
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { setDetalleSlug(null); setDetalle(null) }}
                    style={{
                      background: `linear-gradient(180deg, ${t.primaryLight || t.primary}, ${t.primary})`,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '11px 26px',
                      fontSize: 'var(--cc-sm)',
                      fontWeight: '800',
                      cursor: 'pointer',
                      letterSpacing: '0.02em',
                      boxShadow: `0 4px 16px ${t.primary}44`,
                    }}
                  >
                    Cerrar
                  </button>
                </footer>
              </>
            )}
          </div>
        </div>
      )}

      {/* Form crear / editar — editor + vista previa en vivo, bloques arrastrables */}
      {formAbierto && (
        <div
          style={{
            ...s.overlay,
            backdropFilter: 'blur(5px)',
            WebkitBackdropFilter: 'blur(5px)',
          }}
          onClick={() => !guardando && setFormAbierto(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="guia-editor-titulo"
            style={{
              background: t.bgCard,
              borderRadius: '16px',
              border: `1px solid ${t.border}`,
              width: 'min(1600px, 98vw)',
              maxWidth: '1600px',
              maxHeight: '94vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: `0 20px 60px rgba(0,0,0,0.2), 0 0 0 1px ${t.primary}15`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                flexShrink: 0,
                padding: '10px 14px 8px',
                borderBottom: `1px solid ${t.border}`,
                background: `linear-gradient(90deg, ${t.primary}10, transparent)`,
              }}
            >
              <h2
                id="guia-editor-titulo"
                style={{ margin: '0 0 4px', fontSize: 'var(--cc-title)', color: t.primary, fontWeight: '800' }}
              >
                {formModo === 'crear' ? 'Nueva guía' : 'Editar guía'}
              </h2>
              <p style={{ margin: 0, fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.4 }}>
                Bloques a la izquierda (<strong>⋮⋮</strong> reordena). Imágenes: archivo, <strong>Ctrl+V</strong> o enlace. Derecha = vista final.
              </p>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gap: 0,
                ...(editorSplit
                  ? { gridTemplateColumns: 'minmax(420px, 0.52fr) minmax(320px, 1fr)' }
                  : { gridTemplateColumns: '1fr', gridTemplateRows: 'minmax(220px, 46vh) minmax(260px, 1fr)' }),
              }}
            >
              {/* Columna editor */}
              <aside
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  borderRight: `1px solid ${t.border}`,
                  background: t.bg,
                }}
              >
                <input
                  ref={archivoGuiaInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    const idx = archivoPickIdx
                    e.target.value = ''
                    setArchivoPickIdx(null)
                    if (file != null && idx != null) subirArchivoGuiaBloque(file, idx)
                  }}
                />
                <div style={{ flexShrink: 0, padding: '8px 12px 6px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) minmax(112px, 26%) 56px',
                      gap: '6px 8px',
                      alignItems: 'end',
                      marginBottom: '4px',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <label style={{ ...s.label, fontSize: '10px', marginBottom: '2px', letterSpacing: '0.04em' }}>TÍTULO *</label>
                      <input
                        style={{ ...s.input, padding: '6px 8px', marginBottom: 0 }}
                        value={formTitulo}
                        onChange={(e) => setFormTitulo(e.target.value)}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <label style={{ ...s.label, fontSize: '10px', marginBottom: '2px', letterSpacing: '0.04em' }}>MÓDULO</label>
                      <select
                        style={{ ...s.input, padding: '6px 6px', marginBottom: 0 }}
                        value={formModulo}
                        onChange={(e) => setFormModulo(e.target.value)}
                      >
                        {MODULOS_OPCIONES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ ...s.label, fontSize: '10px', marginBottom: '2px', letterSpacing: '0.04em' }}>ORD.</label>
                      <input
                        type="number"
                        style={{ ...s.input, padding: '6px 6px', marginBottom: 0 }}
                        value={formOrden}
                        onChange={(e) => setFormOrden(parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: '10px',
                      color: t.textMuted,
                      margin: '0 0 6px',
                      lineHeight: 1.3,
                      wordBreak: 'break-all',
                    }}
                  >
                    Slug: <code style={{ color: t.text, fontSize: '10px' }}>{slugPreview(formTitulo)}</code>
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <label style={{ ...s.label, fontSize: '10px', marginBottom: '2px', letterSpacing: '0.04em' }}>DESCRIPCIÓN CORTA</label>
                    <textarea
                      rows={2}
                      style={{
                        ...s.input,
                        minHeight: '40px',
                        maxHeight: '72px',
                        padding: '6px 8px',
                        resize: 'vertical',
                        marginBottom: 0,
                        lineHeight: 1.35,
                      }}
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                    />
                  </div>

                  <span style={{ ...s.label, fontSize: '10px', marginBottom: '4px', display: 'inline-block' }}>BLOQUES · AÑADIR</span>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setFormBloques((b) => [...b, bloqueVacio('subtitulo')])}
                      style={{
                        background: `${t.primary}18`,
                        border: `1px solid ${t.primary}`,
                        color: t.primary,
                        borderRadius: '8px',
                        padding: '5px 10px',
                        fontSize: 'var(--cc-caption)',
                        fontWeight: '800',
                        cursor: 'pointer',
                      }}
                    >
                      + H · Subtítulo
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormBloques((b) => [...b, bloqueVacio('texto')])}
                      style={{
                        background: `${t.primaryLight || t.primary}22`,
                        border: `1px solid ${t.border}`,
                        color: t.text,
                        borderRadius: '8px',
                        padding: '5px 10px',
                        fontSize: 'var(--cc-caption)',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      + T · Texto
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormBloques((b) => [...b, bloqueVacio('imagen')])}
                      style={{
                        background: '#05966922',
                        border: '1px solid #05966988',
                        color: '#047857',
                        borderRadius: '8px',
                        padding: '5px 10px',
                        fontSize: 'var(--cc-caption)',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      + I · Imagen
                    </button>
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 12px 8px' }}>
                  {formBloques.map((bl, idx) => {
                    const tipo = (bl && bl.tipo) || 'texto'
                    const acento =
                      tipo === 'subtitulo'
                        ? { bg: '#7c3aed18', br: '#7c3aed', tag: 'H' }
                        : tipo === 'imagen'
                          ? { bg: '#05966918', br: '#059669', tag: 'I' }
                          : { bg: `${t.primary}14`, br: t.primary, tag: 'T' }
                    const sel = formBloqueFocusIdx === idx
                    return (
                      <div
                        key={bl._key || `b-${idx}`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          const from = parseInt(e.dataTransfer.getData('text/plain'), 10)
                          mueveBloqueDesdeHasta(from, idx)
                        }}
                        onClick={() => setFormBloqueFocusIdx(idx)}
                        style={{
                          border: `2px solid ${sel ? t.primary : t.border}`,
                          borderRadius: '12px',
                          padding: '10px 12px',
                          marginBottom: '12px',
                          background: t.bgCard,
                          boxShadow: sel ? `0 0 0 3px ${t.primary}22` : `0 2px 8px rgba(0,0,0,0.04)`,
                          opacity: dragBloqueIdx === idx ? 0.55 : 1,
                          cursor: 'default',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span
                            draggable
                            title="Arrastrar para reordenar"
                            onDragStart={(e) => {
                              e.stopPropagation()
                              e.dataTransfer.setData('text/plain', String(idx))
                              e.dataTransfer.effectAllowed = 'move'
                              setDragBloqueIdx(idx)
                            }}
                            onDragEnd={() => setDragBloqueIdx(null)}
                            style={{
                              cursor: 'grab',
                              fontSize: 'var(--cc-md)',
                              color: t.textMuted,
                              userSelect: 'none',
                              padding: '2px 4px',
                            }}
                          >
                            ⋮⋮
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: '800',
                              padding: '3px 7px',
                              borderRadius: '6px',
                              background: acento.bg,
                              border: `1px solid ${acento.br}`,
                              color: acento.br,
                            }}
                          >
                            {acento.tag}
                          </span>
                          <span style={{ flex: 1, fontSize: 'var(--cc-caption)', color: t.textMuted, textTransform: 'capitalize' }}>
                            #{idx + 1} · {tipo === 'subtitulo' ? 'subtítulo' : tipo}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setFormBloques((prev) => prev.filter((_, j) => j !== idx))
                              setFormBloqueFocusIdx((f) => {
                                if (f == null) return null
                                if (f === idx) return null
                                if (f > idx) return f - 1
                                return f
                              })
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#b91c1c',
                              fontSize: 'var(--cc-caption)',
                              cursor: 'pointer',
                              fontWeight: '700',
                            }}
                          >
                            Quitar
                          </button>
                        </div>
                        {(tipo === 'texto' || tipo === 'subtitulo') && (
                          <textarea
                            style={{
                              ...s.input,
                              marginBottom: 0,
                              minHeight: tipo === 'subtitulo' ? '60px' : '108px',
                              resize: 'vertical',
                              cursor: 'text',
                            }}
                            placeholder={tipo === 'subtitulo' ? 'Título de sección' : 'Párrafo'}
                            value={bl.contenido || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const v = e.target.value
                              setFormBloques((prev) => {
                                const next = [...prev]
                                next[idx] = { ...next[idx], contenido: v }
                                return next
                              })
                            }}
                          />
                        )}
                        {tipo === 'imagen' && (
                          <>
                            <p style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, margin: '0 0 8px', lineHeight: 1.45 }}>
                              Subí una imagen, pegá captura (<strong>Ctrl+V</strong> con este bloque elegido) o pegá desde el portapapeles. También podés usar un enlace externo abajo.
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                              <button
                                type="button"
                                disabled={uploadingBloqueIdx === idx}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  abrirSelectorArchivoGuia(idx)
                                }}
                                style={{
                                  background: `${t.primary}22`,
                                  border: `1px solid ${t.primary}`,
                                  color: t.primary,
                                  borderRadius: '8px',
                                  padding: '7px 12px',
                                  fontSize: 'var(--cc-caption)',
                                  fontWeight: '800',
                                  cursor: uploadingBloqueIdx === idx ? 'wait' : 'pointer',
                                  opacity: uploadingBloqueIdx === idx ? 0.7 : 1,
                                }}
                              >
                                {uploadingBloqueIdx === idx ? 'Subiendo…' : '📁 Elegir archivo'}
                              </button>
                              <button
                                type="button"
                                disabled={uploadingBloqueIdx === idx}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  pegarImagenDesdeClipboard(idx)
                                }}
                                style={{
                                  background: t.bgCard,
                                  border: `1px solid ${t.border}`,
                                  borderRadius: '8px',
                                  padding: '7px 12px',
                                  fontSize: 'var(--cc-caption)',
                                  fontWeight: '700',
                                  cursor: 'pointer',
                                }}
                              >
                                📋 Pegar portapapeles
                              </button>
                            </div>
                            {bl.url ? (
                              <div
                                style={{
                                  marginBottom: '10px',
                                  borderRadius: '10px',
                                  border: `1px solid ${t.border}`,
                                  overflow: 'hidden',
                                  background: t.bgCard,
                                }}
                              >
                                <a
                                  href={bl.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Abrir imagen en una pestaña nueva"
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  style={{
                                    display: 'block',
                                    lineHeight: 0,
                                    cursor: 'pointer',
                                    outline: 'none',
                                  }}
                                >
                                  <img
                                    src={bl.url}
                                    alt=""
                                    style={{
                                      display: 'block',
                                      width: '100%',
                                      maxHeight: '160px',
                                      objectFit: 'contain',
                                      background: t.bg,
                                      pointerEvents: 'none',
                                    }}
                                  />
                                </a>
                              </div>
                            ) : null}
                            <label style={{ ...s.label, fontSize: 'var(--cc-caption)' }}>ENLACE EXTERNO (OPCIONAL)</label>
                            <input
                              style={{ ...s.input, marginBottom: '8px', cursor: 'text' }}
                              placeholder="https://… si la imagen ya está alojada fuera"
                              value={bl.url || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const v = e.target.value
                                setFormBloques((prev) => {
                                  const next = [...prev]
                                  next[idx] = { ...next[idx], url: v }
                                  return next
                                })
                              }}
                            />
                            <input
                              style={{ ...s.input, marginBottom: 0, cursor: 'text' }}
                              placeholder="Pie de foto / descripción"
                              value={bl.caption || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const v = e.target.value
                                setFormBloques((prev) => {
                                  const next = [...prev]
                                  next[idx] = { ...next[idx], caption: v }
                                  return next
                                })
                              }}
                            />
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div style={{ flexShrink: 0, padding: '10px 12px 12px', borderTop: `1px solid ${t.border}` }}>
                  <label style={{ ...s.label, fontSize: 'var(--cc-caption)', marginBottom: '6px' }}>ROLES QUE PUEDEN VER LA GUÍA</label>
                  <div
                    style={{
                      maxHeight: '100px',
                      overflowY: 'auto',
                      border: `1px solid ${t.border}`,
                      borderRadius: '8px',
                      padding: '8px',
                      marginBottom: '12px',
                      fontSize: 'var(--cc-caption)',
                      background: t.bgCard,
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formRolesIds.length === 0}
                        onChange={(e) => {
                          if (e.target.checked) setFormRolesIds([])
                        }}
                      />
                      <span>Todos los roles</span>
                    </label>
                    {catalogoRoles.map((rol) => (
                      <label
                        key={rol.id}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={formRolesIds.includes(Number(rol.id))}
                          onChange={() => {
                            setFormRolesIds((prev) => {
                              const n = Number(rol.id)
                              if (prev.includes(n)) return prev.filter((x) => x !== n)
                              return [...prev, n]
                            })
                          }}
                        />
                        <span>{rol.nombre}</span>
                      </label>
                    ))}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', cursor: 'pointer', fontSize: 'var(--cc-sm)' }}>
                    <input type="checkbox" checked={formPublicado} onChange={(e) => setFormPublicado(e.target.checked)} />
                    Publicado
                  </label>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() => setFormAbierto(false)}
                      style={{
                        background: 'transparent',
                        border: `1px solid ${t.border}`,
                        borderRadius: '8px',
                        padding: '9px 16px',
                        fontSize: 'var(--cc-sm)',
                        cursor: 'pointer',
                        color: t.textMuted,
                      }}
                    >
                      Cerrar
                    </button>
                    <button
                      type="button"
                      disabled={guardando || !formTitulo.trim()}
                      onClick={guardarForm}
                      style={s.btnCrear}
                    >
                      {guardando ? 'Guardando…' : 'Guardar y cerrar'}
                    </button>
                  </div>
                </div>
              </aside>

              {/* Vista previa */}
              <section
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  background: `linear-gradient(160deg, ${t.primary}08, ${t.bgCard})`,
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    padding: '10px 16px',
                    fontSize: 'var(--cc-caption)',
                    fontWeight: '800',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: t.primary,
                    borderBottom: `1px solid ${t.border}`,
                    background: `${t.primary}10`,
                  }}
                >
                  👁 Vista previa en vivo
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px 20px' }}>
                  <div
                    style={{
                      border: `1px solid ${t.border}`,
                      borderRadius: '14px',
                      overflow: 'hidden',
                      boxShadow: `0 8px 32px rgba(0,0,0,0.07)`,
                    }}
                  >
                    <GuiaPreviewCabecera
                      t={t}
                      titulo={formTitulo}
                      modulo={formModulo}
                      descripcionCorta={formDesc}
                    />
                    <GuiaCuerpoBloques t={t} bloques={formBloques} showEmptyHint />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {eliminarId != null && (
        <div style={s.overlay} onClick={() => !guardando && setEliminarId(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 'var(--cc-md)', fontWeight: '700', marginBottom: '12px', color: t.text }}>
              ¿Eliminar esta guía?
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 'var(--cc-space-4)' }}>
              Esta acción no se puede deshacer.
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setEliminarId(null)}
                style={{
                  background: 'transparent',
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: 'var(--cc-sm)',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={confirmarEliminar}
                style={{
                  background: '#DC2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: 'var(--cc-sm)',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                {guardando ? '…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
