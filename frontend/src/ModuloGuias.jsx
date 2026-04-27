import { useState, useEffect, useMemo, useCallback } from 'react'
import { API_BASE } from './apiBase'
import { getDashTypoUI } from './typographyScale'

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
  if (tipo === 'texto') return { tipo: 'texto', contenido: '' }
  if (tipo === 'subtitulo') return { tipo: 'subtitulo', contenido: '' }
  return { tipo: 'imagen', url: '', caption: '' }
}

export default function ModuloGuias({ t, usuario, token, s, fontSize = 'normal' }) {
  const uiSp = getDashTypoUI(fontSize)
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
    setFormAbierto(true)
  }

  function abrirEditar(g) {
    setFormModo('editar')
    setFormId(g.id)
    setFormTitulo(g.titulo || '')
    setFormModulo(g.modulo || MODULOS_OPCIONES[0])
    setFormDesc(g.descripcion_corta || '')
    const bl = g.bloques
    setFormBloques(Array.isArray(bl) ? [...bl] : [])
    const rv = g.roles_visibles
    setFormRolesIds(Array.isArray(rv) ? rv.map((x) => Number(x)) : [])
    setFormPublicado(!!g.publicado)
    setFormOrden(g.orden != null ? Number(g.orden) : 0)
    setFormAbierto(true)
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
        bloques: formBloques,
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
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: `${Math.max(12, uiSp.rowGap + 10)}px`,
              }}
            >
              {rows.map((g) => (
                <div
                  key={g.id}
                  style={{
                    ...s.card,
                    cursor: 'pointer',
                    position: 'relative',
                    padding: 'var(--cc-space-4)',
                  }}
                  onClick={() => abrirDetalle(g.slug)}
                >
                  {esDesarrollador && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        display: 'flex',
                        gap: '6px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => abrirEditar(g)}
                        style={{
                          background: t.bg,
                          border: `1px solid ${t.border}`,
                          borderRadius: '8px',
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
                          borderRadius: '8px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          fontSize: 'var(--cc-caption)',
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.primary, fontWeight: '700', marginBottom: '6px' }}>
                    {g.modulo || 'General'}
                  </div>
                  <div style={{ fontSize: 'var(--cc-md)', fontWeight: '700', color: t.text, marginBottom: '8px', lineHeight: 1.35 }}>
                    {g.titulo}
                  </div>
                  <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
                    {g.descripcion_corta || '—'}
                  </div>
                  {esDesarrollador && (
                    <div style={{ marginTop: '10px', fontSize: 'var(--cc-caption)', color: g.publicado ? '#059669' : t.textMuted }}>
                      {g.publicado ? '● Publicada' : '○ Borrador'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

      {/* Modal lectura */}
      {detalleSlug && (
        <div style={s.overlay} onClick={() => { setDetalleSlug(null); setDetalle(null) }}>
          <div
            style={{ ...s.modal, maxWidth: '720px', width: '95vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            {cargandoDetalle && <div style={{ fontSize: 'var(--cc-body)' }}>Cargando…</div>}
            {!cargandoDetalle && detalle && (
              <>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.primary, fontWeight: '700', marginBottom: '8px' }}>
                  {detalle.modulo || 'General'}
                </div>
                <h2 style={{ margin: '0 0 var(--cc-space-4)', fontSize: 'var(--cc-h2)', color: t.text }}>{detalle.titulo}</h2>
                <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 'var(--cc-space-5)' }}>
                  {detalle.descripcion_corta}
                </div>
                <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 'var(--cc-space-4)' }}>
                  {(Array.isArray(detalle.bloques) ? detalle.bloques : []).map((b, i) => {
                    const tipo = (b && b.tipo) || 'texto'
                    if (tipo === 'subtitulo') {
                      return (
                        <h3
                          key={i}
                          style={{
                            fontSize: 'var(--cc-lg)',
                            fontWeight: '700',
                            color: t.text,
                            margin: 'var(--cc-space-4) 0 var(--cc-space-2)',
                          }}
                        >
                          {b.contenido || ''}
                        </h3>
                      )
                    }
                    if (tipo === 'imagen') {
                      return (
                        <figure key={i} style={{ margin: 'var(--cc-space-4) 0' }}>
                          {b.url ? (
                            <img
                              src={b.url}
                              alt={b.caption || ''}
                              style={{
                                maxWidth: '100%',
                                borderRadius: '8px',
                                border: `1px solid ${t.border}`,
                              }}
                            />
                          ) : null}
                          {b.caption ? (
                            <figcaption style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: '8px' }}>
                              {b.caption}
                            </figcaption>
                          ) : null}
                        </figure>
                      )
                    }
                    return (
                      <p
                        key={i}
                        style={{
                          fontSize: 'var(--cc-body)',
                          color: t.text,
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          margin: '0 0 var(--cc-space-3)',
                        }}
                      >
                        {b.contenido || ''}
                      </p>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--cc-space-5)' }}>
                  <button
                    type="button"
                    onClick={() => { setDetalleSlug(null); setDetalle(null) }}
                    style={{
                      background: t.primary,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 22px',
                      fontSize: 'var(--cc-sm)',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Form crear / editar */}
      {formAbierto && (
        <div style={s.overlay} onClick={() => !guardando && setFormAbierto(false)}>
          <div
            style={{ ...s.modal, maxWidth: '640px', width: '96vw', maxHeight: '92vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 var(--cc-space-4)', fontSize: 'var(--cc-h2)', color: t.primary }}>
              {formModo === 'crear' ? 'Nueva guía' : 'Editar guía'}
            </h2>

            <label style={s.label}>TÍTULO *</label>
            <input style={s.input} value={formTitulo} onChange={(e) => setFormTitulo(e.target.value)} />
            <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: '-8px', marginBottom: '16px' }}>
              Slug URL: <code style={{ color: t.text }}>{slugPreview(formTitulo)}</code> (se guarda al publicar)
            </div>

            <label style={s.label}>MÓDULO</label>
            <select
              style={s.input}
              value={formModulo}
              onChange={(e) => setFormModulo(e.target.value)}
            >
              {MODULOS_OPCIONES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <label style={s.label}>DESCRIPCIÓN CORTA</label>
            <textarea
              style={{ ...s.input, minHeight: '72px', resize: 'vertical' }}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />

            <label style={s.label}>ORDEN (opcional)</label>
            <input
              type="number"
              style={s.input}
              value={formOrden}
              onChange={(e) => setFormOrden(parseInt(e.target.value, 10) || 0)}
            />

            <div style={{ marginBottom: 'var(--cc-space-4)' }}>
              <span style={s.label}>CONTENIDO (BLOQUES)</span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={() => setFormBloques((b) => [...b, bloqueVacio('texto')])}
                  style={{
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: 'var(--cc-sm)',
                    cursor: 'pointer',
                  }}
                >
                  + Texto
                </button>
                <button
                  type="button"
                  onClick={() => setFormBloques((b) => [...b, bloqueVacio('subtitulo')])}
                  style={{
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: 'var(--cc-sm)',
                    cursor: 'pointer',
                  }}
                >
                  + Subtítulo
                </button>
                <button
                  type="button"
                  onClick={() => setFormBloques((b) => [...b, bloqueVacio('imagen')])}
                  style={{
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: 'var(--cc-sm)',
                    cursor: 'pointer',
                  }}
                >
                  + Imagen (URL)
                </button>
              </div>
              {formBloques.map((bl, idx) => (
                <div
                  key={idx}
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '10px',
                    background: t.bg,
                  }}
                >
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: '8px' }}>
                    Bloque {idx + 1} · {bl.tipo}
                  </div>
                  {(bl.tipo === 'texto' || bl.tipo === 'subtitulo') && (
                    <textarea
                      style={{ ...s.input, marginBottom: 0, minHeight: '80px' }}
                      placeholder={bl.tipo === 'subtitulo' ? 'Título de sección' : 'Texto'}
                      value={bl.contenido || ''}
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
                  {bl.tipo === 'imagen' && (
                    <>
                      <input
                        style={{ ...s.input, marginBottom: '8px' }}
                        placeholder="https://…"
                        value={bl.url || ''}
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
                        style={{ ...s.input, marginBottom: 0 }}
                        placeholder="Pie de foto / descripción"
                        value={bl.caption || ''}
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
                  <button
                    type="button"
                    onClick={() => setFormBloques((prev) => prev.filter((_, j) => j !== idx))}
                    style={{
                      marginTop: '8px',
                      background: 'transparent',
                      border: `1px solid ${t.border}`,
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: 'var(--cc-caption)',
                      cursor: 'pointer',
                      color: t.textMuted,
                    }}
                  >
                    Quitar bloque
                  </button>
                </div>
              ))}
            </div>

            <label style={s.label}>ROLES QUE PUEDEN VER LA GUÍA</label>
            <div
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                padding: '10px',
                marginBottom: '16px',
                fontSize: 'var(--cc-sm)',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formRolesIds.length === 0}
                  onChange={(e) => {
                    if (e.target.checked) setFormRolesIds([])
                  }}
                />
                <span>Todos los roles (lista vacía)</span>
              </label>
              {catalogoRoles.map((rol) => (
                <label
                  key={rol.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', cursor: 'pointer' }}
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

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 'var(--cc-space-4)', cursor: 'pointer', fontSize: 'var(--cc-sm)' }}>
              <input type="checkbox" checked={formPublicado} onChange={(e) => setFormPublicado(e.target.checked)} />
              Publicado (visible en el listado para los roles seleccionados)
            </label>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={guardando}
                onClick={() => setFormAbierto(false)}
                style={{
                  background: 'transparent',
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontSize: 'var(--cc-sm)',
                  cursor: 'pointer',
                  color: t.textMuted,
                }}
              >
                Cerrar
              </button>
              <button type="button" disabled={guardando || !formTitulo.trim()} onClick={guardarForm} style={s.btnCrear}>
                {guardando ? 'Guardando…' : 'Guardar y cerrar'}
              </button>
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
