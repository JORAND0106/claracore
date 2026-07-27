import { useEffect, useState } from 'react'
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

function parseOrdenDia(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x, i) => (
      typeof x === 'object'
        ? { texto: x.texto || x.titulo || '', hecho: !!(x.hecho || x.checked || x.done), key: x.key || i }
        : { texto: String(x), hecho: false, key: i }
    ))
  }
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      return parseOrdenDia(JSON.parse(raw))
    } catch { /* fallthrough */ }
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/\n+/).filter(Boolean).map((texto, i) => ({ texto, hecho: false, key: i }))
  }
  return [{ texto: '', hecho: false, key: 0 }]
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
    orden_items: [{ texto: '', hecho: false, key: 0 }],
    elaborador_id: usuario?.id || null,
    elaborador_nombre: nombre(usuario),
    asistentes: [{ nombre: '', cargo: '', entidad: '', email: '', usuario_id: null, externo_id: null }],
    ideas: [{ texto: '' }],
    apartados: [{ titulo: '', contenido: '' }],
    estado: 'borrador',
  })
  const [claraIdx, setClaraIdx] = useState(null)
  const [compromisoCtx, setCompromisoCtx] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [detalleCompromisoId, setDetalleCompromisoId] = useState(null)
  const soloLectura = form.estado === 'firmada'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (actaId) {
          setLoading(true)
          const a = await api.getActa(actaId)
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
              ? a.asistentes.map((x) => ({
                id: x.id,
                nombre: x.nombre || '',
                cargo: x.cargo || '',
                entidad: x.entidad || '',
                email: x.email || '',
                usuario_id: x.usuario_id || null,
                externo_id: null,
              }))
              : [{ nombre: '', cargo: '', entidad: '', email: '', usuario_id: null, externo_id: null }],
            ideas: (a.ideas || []).length
              ? a.ideas.map((x) => ({ id: x.id, texto: x.texto || '', orden: x.orden }))
              : [{ texto: '' }],
            apartados: (a.apartados || []).length
              ? a.apartados.map((x) => ({ id: x.id, titulo: x.titulo || '', contenido: x.contenido || '' }))
              : [{ titulo: '', contenido: '' }],
            estado: (a.estado === 'en_firma' || a.estado === 'cerrada') ? 'realizada' : (a.estado || 'borrador'),
          })
          const abiertos = await api.compromisosAbiertos(actaId)
          if (!cancelled) setPrevios(abiertos || [])
        } else {
          const [prox, abiertos] = await Promise.all([
            api.proximoConsecutivo(),
            api.compromisosAbiertos(),
          ])
          if (cancelled) return
          setConsecutivo(prox.consecutivo)
          setPrevios(abiertos || [])
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Error cargando acta')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [actaId, api])

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }, [pdfUrl])

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const buildPayload = (extra = {}) => ({
    fecha_reunion: form.fecha_reunion,
    ubicacion: form.ubicacion,
    tipo_acta: form.tipo_acta || 'interna',
    orden_del_dia: (form.orden_items || [])
      .filter((x) => (x.texto || '').trim())
      .map((x) => ({ texto: x.texto.trim(), hecho: !!x.hecho })),
    elaborador_id: form.elaborador_id,
    elaborador_nombre: form.elaborador_nombre,
    asistentes: form.asistentes.filter((a) => a.nombre.trim()),
    ideas: form.ideas.filter((i) => (i.texto || '').trim() || i.id),
    apartados: form.apartados.filter((a) => (a.titulo || a.contenido || '').trim()),
    ...extra,
  })

  const applySavedActa = (row) => {
    setLocalActaId(row.id)
    setConsecutivo(row.consecutivo)
    setForm((f) => ({
      ...f,
      estado: (row.estado === 'en_firma' || row.estado === 'cerrada') ? 'realizada' : (row.estado || f.estado),
      tipo_acta: row.tipo_acta || f.tipo_acta || 'interna',
      elaborador_id: row.elaborador_id,
      elaborador_nombre: row.elaborador_nombre || f.elaborador_nombre,
      asistentes: (row.asistentes || []).length
        ? row.asistentes.map((x) => ({
          id: x.id,
          nombre: x.nombre || '',
          cargo: x.cargo || '',
          entidad: x.entidad || '',
          email: x.email || '',
          usuario_id: x.usuario_id || null,
          externo_id: null,
        }))
        : f.asistentes,
      ideas: (row.ideas || []).length
        ? row.ideas.map((x) => ({ id: x.id, texto: x.texto || '', orden: x.orden }))
        : f.ideas,
      apartados: (row.apartados || []).length
        ? row.apartados.map((x) => ({ id: x.id, titulo: x.titulo || '', contenido: x.contenido || '' }))
        : f.apartados,
      orden_items: parseOrdenDia(row.orden_del_dia),
    }))
    return row
  }

  /** Guarda (crea o actualiza) y deja el acta e ideas con id listos para compromisos. */
  const persistActa = async (extra = {}) => {
    if (!form.elaborador_id) {
      throw new Error('Seleccione un elaborador registrado en el contrato')
    }
    const payload = buildPayload(extra)
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
      setError(e.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const ensureReadyForCompromiso = async (ideaIdxHint, textoHint) => {
    // Asegura texto local y guarda para obtener ids
    let ideas = [...form.ideas]
    if (ideaIdxHint != null && textoHint != null) {
      ideas[ideaIdxHint] = { ...ideas[ideaIdxHint], texto: textoHint }
      setField('ideas', ideas)
    }
    const row = await persistActa()
    const ideaLocal = ideas[ideaIdxHint]
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
      setError(e.message || 'No se pudo preparar el compromiso')
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
      setError(e.message || 'No se pudo generar PDF')
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
      setError(e.message || 'No se pudo firmar')
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
        <button type="button" onClick={onCancel} style={ghost(t)}>{asModal ? 'Cerrar' : 'Volver'}</button>
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
                  const next = [...form.orden_items]
                  next[idx] = { ...it, hecho: e.target.checked }
                  setField('orden_items', next)
                }}
              />
              <input
                disabled={soloLectura}
                value={it.texto}
                placeholder={`Punto ${idx + 1}`}
                onChange={(e) => {
                  const next = [...form.orden_items]
                  next[idx] = { ...it, texto: e.target.value }
                  setField('orden_items', next)
                }}
                style={{ ...inp(t), flex: 1 }}
              />
              {!soloLectura && (
                <button type="button" style={ghost(t)} onClick={() => setField('orden_items', form.orden_items.filter((_, i) => i !== idx))}>✕</button>
              )}
            </div>
          ))}
          {!soloLectura && (
            <button type="button" style={ghost(t)} onClick={() => setField('orden_items', [...form.orden_items, { texto: '', hecho: false, key: Date.now() }])}>
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
            <button type="button" style={ghost(t)} onClick={() => setField('asistentes', [...form.asistentes, { nombre: '', cargo: '', entidad: '', email: '', usuario_id: null, externo_id: null }])}>+ Asistente</button>
          )}
        </div>
        {form.asistentes.map((a, idx) => (
          <div key={idx} className="cc-seguim-asistente-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,2fr) 1fr 1fr 1.2fr auto', gap: 8, marginBottom: 10, alignItems: 'start' }}>
            <UserSearchSelect
              t={t}
              usuarios={usuariosContrato}
              mode="free"
              valueId={a.usuario_id || (a.externo_id ? -Number(a.externo_id) : null)}
              valueNombre={a.nombre}
              placeholder="Buscar o digitar nombre…"
              style={inp(t)}
              onSelect={(u) => {
                const next = [...form.asistentes]
                if (u.es_externo || (u.externo_id != null && Number(u.id) < 0)) {
                  next[idx] = {
                    ...a,
                    usuario_id: null,
                    externo_id: u.externo_id ?? Math.abs(Number(u.id)),
                    nombre: nombreUser(u),
                    cargo: u.cargo_nombre || '',
                    entidad: u.empresa || '',
                    email: u.email || '',
                  }
                } else {
                  next[idx] = {
                    ...a,
                    usuario_id: u.id,
                    externo_id: null,
                    nombre: nombreUser(u),
                    cargo: u.cargo_nombre || a.cargo || '',
                    entidad: u.empresa || a.entidad || '',
                    email: u.email || a.email || '',
                  }
                }
                setField('asistentes', next)
              }}
              onFreeConfirm={({ nombre }) => {
                const next = [...form.asistentes]
                next[idx] = { ...a, usuario_id: null, externo_id: null, nombre }
                setField('asistentes', next)
              }}
            />
            <input placeholder="Cargo" value={a.cargo} onChange={(e) => { const next = [...form.asistentes]; next[idx] = { ...a, cargo: e.target.value }; setField('asistentes', next) }} style={inp(t)} />
            <input placeholder="Entidad / empresa" value={a.entidad} onChange={(e) => { const next = [...form.asistentes]; next[idx] = { ...a, entidad: e.target.value }; setField('asistentes', next) }} style={inp(t)} />
            <input placeholder="Correo" value={a.email || ''} onChange={(e) => { const next = [...form.asistentes]; next[idx] = { ...a, email: e.target.value }; setField('asistentes', next) }} style={inp(t)} />
            <div style={{ display: 'flex', gap: 4 }} className="cc-seguim-asistente-actions">
              {localActaId && a.id && permisos?.validar && form.estado !== 'borrador' && (
                <button type="button" title="Firmar con firma de perfil" onClick={() => firmar(a.id)} style={ghost(t)}>✎</button>
              )}
              {!soloLectura && (
                <button type="button" onClick={() => setField('asistentes', form.asistentes.filter((_, i) => i !== idx))} style={ghost(t)}>✕</button>
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
            <button type="button" style={primary(t)} onClick={() => setField('ideas', [...form.ideas, { texto: '' }])}>+ Agregar idea</button>
          )}
        </div>
        {form.ideas.map((idea, idx) => (
          <div key={idea.id || idx} style={{ marginTop: 10, padding: 12, borderRadius: 8, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.primary, marginBottom: 6 }}>Idea {idx + 1}{idea.id ? ` · #${idea.id}` : ''}</div>
            <textarea rows={4} disabled={soloLectura} value={idea.texto} onChange={(e) => { const next = [...form.ideas]; next[idx] = { ...idea, texto: e.target.value }; setField('ideas', next) }} style={inp(t)} />
            {!soloLectura && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button type="button" style={ghost(t)} onClick={() => setClaraIdx(idx)}>Redactar con Clara</button>
                {permisos?.crear && (
                  <button type="button" style={ghost(t)} disabled={saving || !(idea.texto || '').trim()} onClick={() => abrirCompromiso(idx, idea.texto)}>Generar compromiso</button>
                )}
                <button type="button" style={ghost(t)} onClick={() => setField('ideas', form.ideas.filter((_, i) => i !== idx))}>Quitar</button>
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
            <button type="button" style={ghost(t)} onClick={() => setField('apartados', [...form.apartados, { titulo: '', contenido: '' }])}>+ Apartado</button>
          )}
        </div>
        {form.apartados.map((ap, idx) => (
          <div key={idx} style={{ marginTop: 8 }}>
            <input placeholder="Título" disabled={soloLectura} value={ap.titulo} onChange={(e) => { const next = [...form.apartados]; next[idx] = { ...ap, titulo: e.target.value }; setField('apartados', next) }} style={{ ...inp(t), marginBottom: 6 }} />
            <textarea rows={3} placeholder="Contenido libre" disabled={soloLectura} value={ap.contenido} onChange={(e) => { const next = [...form.apartados]; next[idx] = { ...ap, contenido: e.target.value }; setField('apartados', next) }} style={inp(t)} />
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
          onEnviarAlActa={(texto) => { const next = [...form.ideas]; next[claraIdx] = { ...next[claraIdx], texto }; setField('ideas', next); setClaraIdx(null) }}
          onGenerarCompromiso={async (texto) => { const idx = claraIdx; const next = [...form.ideas]; next[idx] = { ...next[idx], texto }; setField('ideas', next); setClaraIdx(null); await abrirCompromiso(idx, texto) }}
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
            setOkMsg('Compromiso incorporado a la bandeja unificada.')
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
        onClick={onCancel}
        className={viewportCompact ? 'cc-seguim-modal-overlay cc-seguim-modal-overlay--compact' : 'cc-seguim-modal-overlay'}
        style={seguimientoModalOverlayStyle(viewportCompact)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
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
