import { useEffect, useRef, useState } from 'react'
import CompromisoFormModal from './CompromisoFormModal'
import IdeaClaraModal from './IdeaClaraModal'
import ItemDetalleModal from './ItemDetalleModal'
import UbicacionAutocomplete from './UbicacionAutocomplete'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import {
  ACTA_ESTADOS,
  ESTADOS,
  ORIGEN_COLOR,
  fmtFecha,
  labelEstadoActa,
  labelTipoActa,
  numeroActaLabel,
} from './seguimientoTheme'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle } from './seguimientoShared'

const TABS_ACTA = [
  { id: 'encabezado', label: 'Encabezado' },
  { id: 'orden', label: 'Orden del día' },
  { id: 'asistentes', label: 'Asistentes' },
  { id: 'ideas', label: 'Ideas y compromisos' },
  { id: 'apartados', label: 'Apartados' },
  { id: 'acciones', label: 'Vista previa y acciones' },
]

let _rowKeySeq = 0
function newRowKey(prefix = 'r') {
  _rowKeySeq += 1
  return `${prefix}-${Date.now().toString(36)}-${_rowKeySeq}`
}

function emptyAsistente() {
  return {
    _key: newRowKey('as'),
    nombre: '',
    cargo: '',
    entidad: '',
    email: '',
    usuario_id: null,
    externo_id: null,
  }
}

function emptyIdea() {
  return { _key: newRowKey('idea'), texto: '' }
}

function emptyApartado() {
  return { _key: newRowKey('ap'), titulo: '', contenido: '' }
}

function mapAsistenteFromApi(x, prev = null) {
  return {
    _key: prev?._key || (x.id != null ? `as-id-${x.id}` : newRowKey('as')),
    id: x.id,
    nombre: x.nombre || '',
    cargo: x.cargo || '',
    entidad: x.entidad || '',
    email: x.email || '',
    usuario_id: x.usuario_id || null,
    externo_id: x.externo_id ?? prev?.externo_id ?? null,
  }
}

function isAbortLike(e) {
  const name = e?.name || ''
  const msg = String(e?.message || e || '')
  return name === 'AbortError' || name === 'TimeoutError'
    || /aborted|timeout|signal is aborted/i.test(msg)
}

function friendlyFetchError(e, fallback = 'Error de red') {
  if (isAbortLike(e)) return 'La solicitud tardó demasiado. Intente de nuevo.'
  const msg = String(e?.message || '')
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'No se pudo conectar con el servidor. Verifique su conexión e intente de nuevo.'
  }
  return msg || fallback
}

/** Tras guardar: aporta IDs del servidor sin pisar el texto local ni filas vacías. */
function mergeAsistenteIds(local = [], server = []) {
  if (!Array.isArray(server) || !server.length) return local
  const used = new Set()
  return local.map((row) => {
    let match = null
    if (row.id != null) match = server.find((s) => Number(s.id) === Number(row.id))
    if (!match && row.usuario_id) {
      match = server.find((s) => !used.has(s.id) && Number(s.usuario_id) === Number(row.usuario_id))
    }
    if (!match && (row.nombre || '').trim()) {
      const n = row.nombre.trim().toLowerCase()
      match = server.find((s) => !used.has(s.id) && String(s.nombre || '').trim().toLowerCase() === n)
    }
    if (!match) return row
    used.add(match.id)
    return { ...row, id: match.id, externo_id: row.externo_id ?? match.externo_id ?? null }
  })
}

function mergeIdeaIds(local = [], server = []) {
  if (!Array.isArray(server) || !server.length) return local
  const used = new Set()
  return local.map((row, idx) => {
    let match = null
    if (row.id != null) match = server.find((s) => Number(s.id) === Number(row.id))
    if (!match && (row.texto || '').trim()) {
      const t = row.texto.trim()
      match = server.find((s) => !used.has(s.id) && String(s.texto || '').trim() === t)
    }
    if (!match && server[idx] && !used.has(server[idx].id)) match = server[idx]
    if (!match) return row
    used.add(match.id)
    return { ...row, id: match.id, orden: match.orden ?? row.orden }
  })
}

function mergeApartadoIds(local = [], server = []) {
  if (!Array.isArray(server) || !server.length) return local
  const used = new Set()
  return local.map((row, idx) => {
    let match = null
    if (row.id != null) match = server.find((s) => Number(s.id) === Number(row.id))
    if (!match && (row.titulo || '').trim()) {
      const t = row.titulo.trim().toLowerCase()
      match = server.find((s) => !used.has(s.id) && String(s.titulo || '').trim().toLowerCase() === t)
    }
    if (!match && server[idx] && !used.has(server[idx].id)) match = server[idx]
    if (!match) return row
    used.add(match.id)
    return { ...row, id: match.id }
  })
}

function parseOrdenDia(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x, i) => (
      typeof x === 'object'
        ? { texto: x.texto || x.titulo || '', hecho: !!(x.hecho || x.checked || x.done), key: x.key || newRowKey('ord') }
        : { texto: String(x), hecho: false, key: newRowKey('ord') }
    ))
  }
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      return parseOrdenDia(JSON.parse(raw))
    } catch { /* fallthrough */ }
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/\n+/).filter(Boolean).map((texto) => ({ texto, hecho: false, key: newRowKey('ord') }))
  }
  return [{ texto: '', hecho: false, key: newRowKey('ord') }]
}

export default function ActaEditor({
  t,
  api,
  usuario,
  usuariosContrato = [],
  actaId = null,
  onSaved,
  onCancel,
  permisos,
  compact: viewportCompact = false,
  asModal = false,
}) {
  const [loading, setLoading] = useState(!!actaId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [consecutivo, setConsecutivo] = useState(null)
  const [previos, setPrevios] = useState([])
  const [localActaId, setLocalActaId] = useState(actaId)
  const [tab, setTab] = useState('encabezado')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [form, setForm] = useState({
    fecha_reunion: new Date().toISOString().slice(0, 10),
    ubicacion: '',
    tipo_acta: 'interna',
    orden_items: [{ texto: '', hecho: false, key: newRowKey('ord') }],
    elaborador_id: usuario?.id || null,
    elaborador_nombre: nombre(usuario),
    asistentes: [emptyAsistente()],
    ideas: [emptyIdea()],
    apartados: [emptyApartado()],
    estado: 'borrador',
  })
  const [claraIdx, setClaraIdx] = useState(null)
  const [compromisoCtx, setCompromisoCtx] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [detalleCompromisoId, setDetalleCompromisoId] = useState(null)
  const soloLectura = form.estado === 'firmada'
  /** Evita re-hidratar desde API cuando el padre pasa actaId tras el primer guardado local. */
  const skipServerHydrateRef = useRef(false)
  /** Acta ya hidratada en esta sesión del popup — no volver a pisar el formulario. */
  const hydratedActaIdRef = useRef(null)
  const apiRef = useRef(api)
  apiRef.current = api

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const client = apiRef.current
      if (skipServerHydrateRef.current) {
        skipServerHydrateRef.current = false
        hydratedActaIdRef.current = actaId
        if (!cancelled) setLoading(false)
        return
      }
      // Misma acta ya cargada: no refrescar (evita pérdida de datos por re-render / nueva ref de api).
      if (actaId != null && hydratedActaIdRef.current === actaId) {
        if (!cancelled) setLoading(false)
        return
      }
      // Nueva acta en blanco: hidratar metadatos una sola vez por montaje.
      if (actaId == null && hydratedActaIdRef.current === 'new') {
        return
      }
      try {
        if (actaId) {
          setLoading(true)
          const a = await client.getActa(actaId)
          if (cancelled) return
          setLocalActaId(a.id)
          setConsecutivo(a.consecutivo)
          setForm({
            fecha_reunion: String(a.fecha_reunion || '').slice(0, 10),
            ubicacion: a.ubicacion || '',
            tipo_acta: a.tipo_acta || 'interna',
            orden_items: parseOrdenDia(a.orden_del_dia),
            elaborador_id: a.elaborador_id,
            elaborador_nombre: a.elaborador_nombre || '',
            asistentes: (a.asistentes || []).length
              ? a.asistentes.map((x) => mapAsistenteFromApi(x))
              : [emptyAsistente()],
            ideas: (a.ideas || []).length
              ? a.ideas.map((x) => ({
                _key: x.id != null ? `idea-id-${x.id}` : newRowKey('idea'),
                id: x.id,
                texto: x.texto || '',
                orden: x.orden,
              }))
              : [emptyIdea()],
            apartados: (a.apartados || []).length
              ? a.apartados.map((x) => ({
                _key: x.id != null ? `ap-id-${x.id}` : newRowKey('ap'),
                id: x.id,
                titulo: x.titulo || '',
                contenido: x.contenido || '',
              }))
              : [emptyApartado()],
            estado: (a.estado === 'en_firma' || a.estado === 'cerrada') ? 'realizada' : (a.estado || 'borrador'),
          })
          hydratedActaIdRef.current = a.id
          try {
            const abiertos = await client.compromisosAbiertos(actaId)
            if (!cancelled) setPrevios(abiertos || [])
          } catch (e) {
            if (!cancelled && !isAbortLike(e)) {
              console.warn('[ActaEditor] compromisos abiertos', e?.message || e)
            }
          }
        } else {
          const [prox, abiertos] = await Promise.all([
            client.proximoConsecutivo(),
            client.compromisosAbiertos().catch((e) => {
              if (!isAbortLike(e)) console.warn('[ActaEditor] compromisos abiertos', e?.message || e)
              return []
            }),
          ])
          if (cancelled) return
          setConsecutivo(prox?.consecutivo ?? null)
          setPrevios(abiertos || [])
          hydratedActaIdRef.current = 'new'
        }
      } catch (e) {
        if (!cancelled && !isAbortLike(e)) setError(friendlyFetchError(e, 'Error cargando acta'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [actaId])

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }, [pdfUrl])

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  /** Actualiza listas del formulario con updater funcional (evita carreras stale al agregar/seleccionar). */
  const patchList = (k, updater) => {
    setForm((f) => ({ ...f, [k]: updater(f[k] || []) }))
  }

  const buildPayload = (extra = {}, formSrc = form) => ({
    fecha_reunion: formSrc.fecha_reunion,
    ubicacion: formSrc.ubicacion,
    tipo_acta: formSrc.tipo_acta || 'interna',
    orden_del_dia: (formSrc.orden_items || [])
      .filter((x) => (x.texto || '').trim())
      .map((x) => ({ texto: x.texto.trim(), hecho: !!x.hecho })),
    elaborador_id: formSrc.elaborador_id,
    elaborador_nombre: formSrc.elaborador_nombre,
    asistentes: (formSrc.asistentes || [])
      .filter((a) => (a.nombre || '').trim())
      .map((a) => ({
        id: a.id || undefined,
        nombre: a.nombre.trim(),
        cargo: (a.cargo || '').trim() || null,
        entidad: (a.entidad || '').trim() || null,
        email: (a.email || '').trim() || null,
        usuario_id: a.usuario_id && Number(a.usuario_id) > 0 ? Number(a.usuario_id) : null,
      })),
    ideas: (formSrc.ideas || [])
      .filter((i) => (i.texto || '').trim() || i.id)
      .map((i) => ({
        id: i.id || undefined,
        texto: i.texto || '',
        orden: i.orden,
      })),
    apartados: (formSrc.apartados || [])
      .filter((a) => (a.titulo || a.contenido || '').trim())
      .map((a) => ({
        id: a.id || undefined,
        titulo: a.titulo || '',
        contenido: a.contenido || '',
      })),
    ...extra,
  })

  const applySavedActa = (row) => {
    skipServerHydrateRef.current = true
    hydratedActaIdRef.current = row.id
    setLocalActaId(row.id)
    setConsecutivo(row.consecutivo)
    // Solo sincroniza metadatos e IDs; no reemplaza el contenido local diligeniado.
    setForm((f) => ({
      ...f,
      estado: (row.estado === 'en_firma' || row.estado === 'cerrada') ? 'realizada' : (row.estado || f.estado),
      tipo_acta: row.tipo_acta || f.tipo_acta || 'interna',
      elaborador_id: row.elaborador_id ?? f.elaborador_id,
      elaborador_nombre: row.elaborador_nombre || f.elaborador_nombre,
      asistentes: mergeAsistenteIds(f.asistentes, row.asistentes),
      ideas: mergeIdeaIds(f.ideas, row.ideas),
      apartados: mergeApartadoIds(f.apartados, row.apartados),
    }))
    return row
  }

  /** Guarda (crea o actualiza) y deja el acta e ideas con id listos para compromisos. */
  const persistActa = async (extra = {}, formSrc = null) => {
    const src = formSrc || form
    if (!src.elaborador_id) {
      throw new Error('Seleccione un elaborador registrado en el contrato')
    }
    const payload = buildPayload(extra, src)
    const row = localActaId
      ? await api.updateActa(localActaId, payload)
      : await api.createActa(payload)
    return applySavedActa(row)
  }

  const guardar = async ({ estadoExtra } = {}) => {
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      if (!form.elaborador_id) {
        throw new Error('El elaborador es obligatorio')
      }
      const row = await persistActa(estadoExtra ? { estado: estadoExtra } : {})
      const msg = estadoExtra === 'realizada'
        ? 'Acta marcada como Realizada.'
        : 'Acta guardada correctamente.'
      setOkMsg(msg)
      onSaved?.(row, { stay: true, enviada: estadoExtra === 'realizada' })
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  const ensureReadyForCompromiso = async (ideaIdxHint, textoHint) => {
    // Asegura texto local y guarda para obtener ids
    let ideasSnapshot = form.ideas
    if (ideaIdxHint != null && textoHint != null) {
      ideasSnapshot = form.ideas.map((row, i) => (
        i === ideaIdxHint ? { ...row, texto: textoHint } : row
      ))
      patchList('ideas', () => ideasSnapshot)
    }
    const formSrc = { ...form, ideas: ideasSnapshot }
    const row = await persistActa({}, formSrc)
    const ideaLocal = ideasSnapshot[ideaIdxHint]
    let ideaId = ideaLocal?.id
    if (!ideaId && ideaIdxHint != null) {
      // match por orden / texto tras guardar
      const saved = row.ideas || []
      const byTexto = saved.find((x) => (x.texto || '').trim() === (textoHint || ideaLocal?.texto || '').trim())
      ideaId = byTexto?.id || saved[ideaIdxHint]?.id
    }
    if (!ideaId) throw new Error('No se pudo identificar la idea tras guardar el acta')
    return { actaId: row.id, ideaId, texto: textoHint || ideaLocal?.texto || '' }
  }

  const abrirCompromiso = async (ideaIdx, texto) => {
    setSaving(true)
    setError('')
    try {
      const ctx = await ensureReadyForCompromiso(ideaIdx, texto)
      setCompromisoCtx(ctx)
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo preparar el compromiso'))
    } finally {
      setSaving(false)
    }
  }

  const previewPdf = async () => {
    setPdfBusy(true)
    setError('')
    setOkMsg('')
    try {
      if (!form.elaborador_id) {
        throw new Error('Indique el elaborador antes de generar la vista previa')
      }
      const row = await persistActa()
      const blob = await api.pdfActaBlob(row.id)
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
      setTab('acciones')
      setOkMsg('Vista previa generada.')
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo generar PDF'))
    } finally {
      setPdfBusy(false)
    }
  }

  const firmar = async (asistenteId) => {
    try {
      let aid = localActaId
      if (!aid) {
        const row = await persistActa()
        aid = row.id
      }
      await api.firmarActa(aid, asistenteId)
      const a = await api.getActa(aid)
      applySavedActa(a)
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo firmar'))
    }
  }

  if (loading) {
    return <div style={{ color: t.textMuted, fontSize: 'var(--cc-body)', padding: 16 }}>Cargando acta…</div>
  }

  const body = (
    <div className={viewportCompact ? 'cc-seguim-acta-editor cc-seguim-acta-editor--compact' : 'cc-seguim-acta-editor'} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="cc-seguim-acta-head" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: asModal ? 'var(--cc-title)' : 'var(--cc-h2)', fontWeight: 700, color: t.text }}>
            {consecutivo != null ? numeroActaLabel(consecutivo) : 'Nueva acta de reunión'}
          </div>
          <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            {labelEstadoActa(form.estado)} · {labelTipoActa(form.tipo_acta)} · elaborador obligatorio
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {(permisos?.crear || permisos?.editar) && !soloLectura && (
            <button type="button" disabled={saving} onClick={() => guardar()} style={primary(t)}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          )}
          <button type="button" onClick={onCancel} style={ghost(t)}>{asModal ? 'Cerrar' : 'Volver'}</button>
        </div>
      </div>

      <div className="cc-seguim-acta-tabs" style={{ display: 'flex', gap: 2, flexWrap: 'nowrap', borderBottom: `1px solid ${t.border}`, paddingBottom: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {TABS_ACTA.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            style={{
              border: 'none',
              borderBottom: tab === tb.id ? `2px solid ${t.primary}` : '2px solid transparent',
              background: 'transparent',
              color: tab === tb.id ? t.primary : t.textMuted,
              fontWeight: tab === tb.id ? 700 : 500,
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: 'var(--cc-sm)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          background: 'color-mix(in srgb, var(--cc-color-danger,#b91c1c) 12%, transparent)',
          border: '1px solid var(--cc-color-danger,#b91c1c)',
          color: t.text, padding: '8px 12px', borderRadius: 8, fontSize: 'var(--cc-sm)',
        }}>{error}</div>
      )}
      {okMsg && (
        <div style={{
          background: 'color-mix(in srgb, var(--cc-color-positive,#0f766e) 12%, transparent)',
          border: '1px solid var(--cc-color-positive,#0f766e)',
          color: t.text, padding: '8px 12px', borderRadius: 8, fontSize: 'var(--cc-sm)',
        }}>{okMsg}</div>
      )}

      {tab === 'encabezado' && (
      <section style={card(t)}>
        <h3 style={h3(t)}>Encabezado</h3>
        <div className="cc-seguim-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <Field t={t} label="Fecha de la reunión">
            <input type="date" disabled={soloLectura} value={form.fecha_reunion} onChange={(e) => setField('fecha_reunion', e.target.value)} style={inp(t)} />
          </Field>
          <Field t={t} label="Tipo de acta *">
            <select
              disabled={soloLectura}
              value={form.tipo_acta || 'interna'}
              onChange={(e) => setField('tipo_acta', e.target.value)}
              style={inp(t)}
            >
              <option value="interna">Interna</option>
              <option value="externa">Externa</option>
            </select>
          </Field>
          <Field t={t} label="Ubicación">
            <UbicacionAutocomplete
              t={t}
              value={form.ubicacion}
              onChange={(v) => setField('ubicacion', v)}
              style={inp(t)}
            />
          </Field>
          <Field t={t} label="Elaborador *">
            <UserSearchSelect
              t={t}
              usuarios={usuariosContrato}
              mode="strict"
              valueId={form.elaborador_id}
              valueNombre={form.elaborador_nombre}
              placeholder="Buscar usuario del contrato…"
              style={inp(t)}
              onSelect={(u) => {
                if (!u) {
                  setForm((f) => ({ ...f, elaborador_id: null, elaborador_nombre: '' }))
                  return
                }
                setForm((f) => ({
                  ...f,
                  elaborador_id: u.id,
                  elaborador_nombre: nombreUser(u),
                }))
              }}
            />
          </Field>
          <Field t={t} label="Estado">
            <select disabled value={form.estado || 'borrador'} style={inp(t)}>
              {ACTA_ESTADOS.filter((x) => x.value).map((x) => (
                <option key={x.value} value={x.value}>{x.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>
      )}

      {tab === 'orden' && (
      <section style={card(t)}>
        <h3 style={h3(t)}>Orden del día</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(form.orden_items || []).map((it, idx) => (
            <div key={it.key ?? idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                disabled={soloLectura}
                checked={!!it.hecho}
                onChange={(e) => {
                  const checked = e.target.checked
                  patchList('orden_items', (list) => list.map((row, i) => (
                    i === idx ? { ...row, hecho: checked } : row
                  )))
                }}
              />
              <input
                disabled={soloLectura}
                value={it.texto}
                placeholder={`Punto ${idx + 1}`}
                onChange={(e) => {
                  const texto = e.target.value
                  patchList('orden_items', (list) => list.map((row, i) => (
                    i === idx ? { ...row, texto } : row
                  )))
                }}
                style={{ ...inp(t), flex: 1 }}
              />
              {!soloLectura && (
                <button
                  type="button"
                  style={ghost(t)}
                  onClick={() => patchList('orden_items', (list) => list.filter((_, i) => i !== idx))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {!soloLectura && (
            <button
              type="button"
              style={ghost(t)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => patchList('orden_items', (list) => [...list, { texto: '', hecho: false, key: newRowKey('ord') }])}
            >
              + Agregar punto
            </button>
          )}
        </div>
      </section>
      )}


      {tab === 'ideas' && (
      <section style={card(t)}>
        <h3 style={h3(t)}>Compromisos abiertos de actas anteriores</h3>
        {previos.length === 0 ? (
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>No hay compromisos abiertos previos.</div>
        ) : (
          <div className="cc-seguim-table-scroll" style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 10 }}>
            <table className="cc-seguim-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', minWidth: viewportCompact ? 0 : 640 }}>
              <thead>
                <tr style={{ background: t.bg || `${t.primary}10`, color: t.textMuted, textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Acta origen</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Compromiso</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Asignado</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Vence</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {previos.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setDetalleCompromisoId(c.id)}
                    style={{
                      cursor: 'pointer',
                      borderTop: `1px solid ${t.border}`,
                      background: ORIGEN_COLOR.compromiso.bg,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.98)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}
                  >
                    <td data-label="Acta origen" style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 600, color: ORIGEN_COLOR.compromiso.border }}>
                      {c.acta_numero || (c.acta_consecutivo != null ? numeroActaLabel(c.acta_consecutivo) : '—')}
                      {c.acta_fecha ? ` · ${fmtFecha(c.acta_fecha)}` : ''}
                    </td>
                    <td data-label="Compromiso" style={{ padding: '8px 10px', fontWeight: 600, color: t.text, maxWidth: 280 }}>{c.titulo}</td>
                    <td data-label="Asignado" style={{ padding: '8px 10px', color: t.text }}>{c.asignado_a_nombre || '—'}</td>
                    <td data-label="Vence" style={{ padding: '8px 10px', color: t.text }}>{fmtFecha(c.fecha_vencimiento)}</td>
                    <td data-label="Estado" style={{ padding: '8px 10px', color: t.textMuted }}>
                      {ESTADOS.find((x) => x.value === c.estado_gestion)?.label || c.estado_gestion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {tab === 'asistentes' && (
      <section style={card(t)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={h3(t)}>Asistentes</h3>
          {!soloLectura && (
            <button
              type="button"
              style={ghost(t)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => patchList('asistentes', (list) => [...list, emptyAsistente()])}
            >
              + Asistente
            </button>
          )}
        </div>
        {form.asistentes.map((a, idx) => (
          <div key={a._key || a.id || `as-${idx}`} className="cc-seguim-asistente-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,2fr) 1fr 1fr 1.2fr auto', gap: 8, marginBottom: 10, alignItems: 'start' }}>
            <UserSearchSelect
              t={t}
              usuarios={usuariosContrato}
              mode="free"
              valueId={a.usuario_id || (a.externo_id ? -Number(a.externo_id) : null)}
              valueNombre={a.nombre}
              placeholder="Buscar o digitar nombre…"
              style={inp(t)}
              onSelect={(u) => {
                patchList('asistentes', (list) => list.map((row, i) => {
                  if (i !== idx) return row
                  if (u.es_externo || (u.externo_id != null && Number(u.id) < 0)) {
                    return {
                      ...row,
                      usuario_id: null,
                      externo_id: u.externo_id ?? Math.abs(Number(u.id)),
                      nombre: nombreUser(u),
                      cargo: u.cargo_nombre || '',
                      entidad: u.empresa || '',
                      email: u.email || '',
                    }
                  }
                  return {
                    ...row,
                    usuario_id: u.id,
                    externo_id: null,
                    nombre: nombreUser(u),
                    cargo: u.cargo_nombre || row.cargo || '',
                    entidad: u.empresa || row.entidad || '',
                    email: u.email || row.email || '',
                  }
                }))
              }}
              onFreeConfirm={({ nombre }) => {
                patchList('asistentes', (list) => list.map((row, i) => (
                  i === idx
                    ? { ...row, usuario_id: null, externo_id: null, nombre }
                    : row
                )))
              }}
            />
            <input
              placeholder="Cargo"
              value={a.cargo}
              onChange={(e) => {
                const cargo = e.target.value
                patchList('asistentes', (list) => list.map((row, i) => (i === idx ? { ...row, cargo } : row)))
              }}
              style={inp(t)}
            />
            <input
              placeholder="Entidad / empresa"
              value={a.entidad}
              onChange={(e) => {
                const entidad = e.target.value
                patchList('asistentes', (list) => list.map((row, i) => (i === idx ? { ...row, entidad } : row)))
              }}
              style={inp(t)}
            />
            <input
              placeholder="Correo"
              value={a.email || ''}
              onChange={(e) => {
                const email = e.target.value
                patchList('asistentes', (list) => list.map((row, i) => (i === idx ? { ...row, email } : row)))
              }}
              style={inp(t)}
            />
            <div style={{ display: 'flex', gap: 4 }} className="cc-seguim-asistente-actions">
              {localActaId && a.id && permisos?.validar && form.estado !== 'borrador' && (
                <button type="button" title="Firmar con firma de perfil" onClick={() => firmar(a.id)} style={ghost(t)}>✎</button>
              )}
              {!soloLectura && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => patchList('asistentes', (list) => list.filter((_, i) => i !== idx))}
                  style={ghost(t)}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
      )}

      {tab === 'ideas' && (
      <section style={card(t)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={h3(t)}>Ideas centrales</h3>
          {!soloLectura && (
            <button
              type="button"
              style={primary(t)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => patchList('ideas', (list) => [...list, emptyIdea()])}
            >
              + Agregar idea
            </button>
          )}
        </div>
        {form.ideas.map((idea, idx) => (
          <div key={idea._key || idea.id || `idea-${idx}`} style={{ marginTop: 10, padding: 12, borderRadius: 8, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.primary, marginBottom: 6 }}>Idea {idx + 1}{idea.id ? ` · #${idea.id}` : ''}</div>
            <textarea
              rows={4}
              disabled={soloLectura}
              value={idea.texto}
              onChange={(e) => {
                const texto = e.target.value
                patchList('ideas', (list) => list.map((row, i) => (i === idx ? { ...row, texto } : row)))
              }}
              style={inp(t)}
            />
            {!soloLectura && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button type="button" style={ghost(t)} onClick={() => setClaraIdx(idx)}>Redactar con Clara</button>
                {permisos?.crear && (
                  <button type="button" style={ghost(t)} disabled={saving || !(idea.texto || '').trim()} onClick={() => abrirCompromiso(idx, idea.texto)}>Generar compromiso</button>
                )}
                <button
                  type="button"
                  style={ghost(t)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => patchList('ideas', (list) => list.filter((_, i) => i !== idx))}
                >
                  Quitar
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
      )}

      {tab === 'apartados' && (
      <section style={card(t)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={h3(t)}>Apartados adicionales</h3>
          {!soloLectura && (
            <button
              type="button"
              style={ghost(t)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => patchList('apartados', (list) => [...list, emptyApartado()])}
            >
              + Apartado
            </button>
          )}
        </div>
        {form.apartados.map((ap, idx) => (
          <div key={ap._key || ap.id || `ap-${idx}`} style={{ marginTop: 8 }}>
            <input
              placeholder="Título"
              disabled={soloLectura}
              value={ap.titulo}
              onChange={(e) => {
                const titulo = e.target.value
                patchList('apartados', (list) => list.map((row, i) => (i === idx ? { ...row, titulo } : row)))
              }}
              style={{ ...inp(t), marginBottom: 6 }}
            />
            <textarea
              rows={3}
              placeholder="Contenido libre"
              disabled={soloLectura}
              value={ap.contenido}
              onChange={(e) => {
                const contenido = e.target.value
                patchList('apartados', (list) => list.map((row, i) => (i === idx ? { ...row, contenido } : row)))
              }}
              style={inp(t)}
            />
          </div>
        ))}
      </section>
      )}

      {tab === 'acciones' && (
      <section style={card(t)}>
        <h3 style={h3(t)}>Vista previa y acciones del sistema</h3>
        <div className="cc-seguim-acta-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {(permisos?.crear || permisos?.editar) && !soloLectura && (
            <button type="button" disabled={saving} onClick={() => guardar()} style={primary(t)}>{saving ? 'Guardando…' : 'Guardar acta'}</button>
          )}
          {(permisos?.crear || permisos?.editar) && !soloLectura && form.estado === 'borrador' && (
            <button type="button" disabled={saving} onClick={() => guardar({ estadoExtra: 'realizada' })} style={primary(t)}>Marcar como Realizada</button>
          )}
          {(permisos?.crear || permisos?.editar) && (
            <button type="button" disabled={pdfBusy || saving} onClick={previewPdf} style={ghost(t)}>{pdfBusy ? 'Generando PDF…' : 'Generar vista previa PDF'}</button>
          )}
          {form.estado === 'realizada' && permisos?.validar && (
            <button type="button" style={ghost(t)} onClick={() => { setTab('asistentes'); setOkMsg('Use el botón ✎ junto a cada asistente para registrar la firma de perfil.') }}>Enviar a firma</button>
          )}
          {permisos?.esDesarrollador && localActaId && (
            <button type="button" style={{ ...ghost(t), color: 'var(--cc-color-danger,#b91c1c)', borderColor: 'var(--cc-color-danger,#b91c1c)' }} onClick={async () => {
              if (!window.confirm('¿Eliminar definitivamente esta acta?')) return
              try { await api.deleteActa(localActaId); onCancel?.(); onSaved?.(null, { deleted: true }) } catch (e) { setError(e.message) }
            }}>Eliminar</button>
          )}
        </div>
        {pdfUrl ? (
          <iframe title="PDF acta" src={pdfUrl} style={{ width: '100%', height: 480, border: `1px solid ${t.border}`, borderRadius: 8 }} />
        ) : (
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Genere la vista previa para visualizar el PDF del acta en este panel.</div>
        )}
      </section>
      )}

      {claraIdx != null && (
        <IdeaClaraModal
          t={t}
          api={api}
          textoInicial={form.ideas[claraIdx]?.texto || ''}
          onClose={() => setClaraIdx(null)}
          onEnviarAlActa={(texto) => {
            patchList('ideas', (list) => list.map((row, i) => (i === claraIdx ? { ...row, texto } : row)))
            setClaraIdx(null)
          }}
          onGenerarCompromiso={async (texto) => {
            const idx = claraIdx
            patchList('ideas', (list) => list.map((row, i) => (i === idx ? { ...row, texto } : row)))
            setClaraIdx(null)
            await abrirCompromiso(idx, texto)
          }}
        />
      )}

      {compromisoCtx && (
        <CompromisoFormModal
          t={t}
          usuario={usuario}
          textoIdea={compromisoCtx.texto}
          usuarios={usuariosContrato}
          onClose={() => setCompromisoCtx(null)}
          onSubmit={async (body) => {
            await api.crearCompromiso(compromisoCtx.actaId, compromisoCtx.ideaId, body)
            setCompromisoCtx(null)
            setError('')
            setOkMsg('Compromiso incorporado a la bandeja. Los asignados ya fueron notificados.')
            try {
              const abiertos = await api.compromisosAbiertos(localActaId || undefined)
              setPrevios(abiertos || [])
            } catch { /* ignore */ }
          }}
        />
      )}

      {detalleCompromisoId != null && (
        <ItemDetalleModal
          t={t}
          api={api}
          itemId={detalleCompromisoId}
          usuario={usuario}
          usuarios={usuariosContrato}
          permisos={permisos}
          allowEstadoGestion
          revisionEnActa
          viewportCompact={viewportCompact}
          onClose={() => setDetalleCompromisoId(null)}
          onChanged={async () => {
            try {
              const abiertos = await api.compromisosAbiertos(localActaId || undefined)
              setPrevios(abiertos || [])
            } catch { /* ignore */ }
          }}
        />
      )}
    </div>
  )

  if (asModal) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className={viewportCompact ? 'cc-seguim-modal-overlay cc-seguim-modal-overlay--compact' : 'cc-seguim-modal-overlay'}
        style={seguimientoModalOverlayStyle(viewportCompact)}
      >
        <div
          className={viewportCompact ? 'cc-seguim-modal-sheet cc-seguim-modal-sheet--acta' : 'cc-seguim-modal-sheet--desktop'}
          style={{
            ...seguimientoModalSheetStyle(viewportCompact, { wide: true }),
            background: t.bgCard,
            border: viewportCompact ? 'none' : `1px solid ${t.border}`,
            boxShadow: t.shadow,
            width: viewportCompact ? '100%' : 'min(1180px, 98vw)',
          }}
        >
          {body}
        </div>
      </div>
    )
  }
  return body
}


function nombre(u) {
  if (!u) return ''
  return `${u.nombre || ''} ${u.apellidos || ''}`.trim()
}
function Field({ t, label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 'var(--cc-label)', color: t.textMuted, fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}
function card(t) {
  return { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16 }
}
function h3(t) {
  return { margin: '0 0 10px', fontSize: 'var(--cc-lg)', fontWeight: 700, color: t.text }
}
function inp(t) {
  return {
    width: '100%', boxSizing: 'border-box', fontSize: 'var(--cc-input)',
    padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
    background: t.bg || '#fff', color: t.text,
  }
}
function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}
