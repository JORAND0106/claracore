import { useEffect, useState } from 'react'
import CompromisoFormModal from './CompromisoFormModal'
import IdeaClaraModal from './IdeaClaraModal'
import UbicacionAutocomplete from './UbicacionAutocomplete'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import { ESTADOS, ORIGEN_COLOR, fmtFecha } from './seguimientoTheme'

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
}) {
  const [loading, setLoading] = useState(!!actaId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [consecutivo, setConsecutivo] = useState(null)
  const [previos, setPrevios] = useState([])
  const [localActaId, setLocalActaId] = useState(actaId)
  const [form, setForm] = useState({
    fecha_reunion: new Date().toISOString().slice(0, 10),
    ubicacion: '',
    orden_items: [{ texto: '', hecho: false, key: 0 }],
    elaborador_id: usuario?.id || null,
    elaborador_nombre: nombre(usuario),
    asistentes: [{ nombre: '', cargo: '', entidad: '', email: '', usuario_id: null }],
    ideas: [{ texto: '' }],
    apartados: [{ titulo: '', contenido: '' }],
    estado: 'borrador',
  })
  const [claraIdx, setClaraIdx] = useState(null)
  const [compromisoCtx, setCompromisoCtx] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)

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
                usuario_id: x.usuario_id,
              }))
              : [{ nombre: '', cargo: '', entidad: '', email: '', usuario_id: null }],
            ideas: (a.ideas || []).length
              ? a.ideas.map((x) => ({ id: x.id, texto: x.texto || '', orden: x.orden }))
              : [{ texto: '' }],
            apartados: (a.apartados || []).length
              ? a.apartados.map((x) => ({ id: x.id, titulo: x.titulo || '', contenido: x.contenido || '' }))
              : [{ titulo: '', contenido: '' }],
            estado: a.estado || 'borrador',
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
      estado: row.estado || f.estado,
      elaborador_id: row.elaborador_id,
      elaborador_nombre: row.elaborador_nombre || f.elaborador_nombre,
      asistentes: (row.asistentes || []).length
        ? row.asistentes.map((x) => ({
          id: x.id,
          nombre: x.nombre || '',
          cargo: x.cargo || '',
          entidad: x.entidad || '',
          email: x.email || '',
          usuario_id: x.usuario_id,
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

  const guardar = async ({ enviar = false } = {}) => {
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const row = await persistActa(enviar ? { estado: 'en_firma' } : {})
      setOkMsg(enviar ? 'Acta enviada (en firma).' : 'Acta guardada correctamente.')
      onSaved?.(row, { stay: true, enviada: enviar })
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
    try {
      const row = localActaId ? await persistActa() : await persistActa()
      const blob = await api.pdfActaBlob(row.id)
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      setPdfUrl(URL.createObjectURL(blob))
    } catch (e) {
      setError(e.message || 'No se pudo generar PDF')
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
    return <div style={{ color: t.textMuted, fontSize: 'var(--cc-body)' }}>Cargando acta…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 'var(--cc-h2)', fontWeight: 700, color: t.text }}>
            Acta de reunión {consecutivo != null ? `Nº ${consecutivo}` : ''}
          </div>
          <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            Estado: {form.estado || 'borrador'} · numeración consecutiva del contrato
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={onCancel} style={ghost(t)}>Volver</button>
          {(permisos?.crear || permisos?.editar) && (
            <button type="button" disabled={saving} onClick={previewPdf} style={ghost(t)}>Vista previa PDF</button>
          )}
          {(permisos?.crear || permisos?.editar) && (
            <button type="button" disabled={saving} onClick={() => guardar({ enviar: false })} style={primary(t)}>
              {saving ? 'Guardando…' : 'Guardar acta'}
            </button>
          )}
          {(permisos?.crear || permisos?.editar) && (
            <button type="button" disabled={saving} onClick={() => guardar({ enviar: true })} style={primary(t)}>
              Enviar acta
            </button>
          )}
          {permisos?.esDesarrollador && localActaId && (
            <button
              type="button"
              style={{ ...ghost(t), color: 'var(--cc-color-danger,#b91c1c)', borderColor: 'var(--cc-color-danger,#b91c1c)' }}
              onClick={async () => {
                if (!window.confirm('¿Eliminar definitivamente esta acta?')) return
                try {
                  await api.deleteActa(localActaId)
                  onCancel?.()
                  onSaved?.(null, { deleted: true })
                } catch (e) {
                  setError(e.message)
                }
              }}
            >
              Eliminar
            </button>
          )}
        </div>
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

      <section style={card(t)}>
        <h3 style={h3(t)}>Encabezado</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <Field t={t} label="Fecha de la reunión">
            <input type="date" value={form.fecha_reunion} onChange={(e) => setField('fecha_reunion', e.target.value)} style={inp(t)} />
          </Field>
          <Field t={t} label="Ubicación">
            <UbicacionAutocomplete
              t={t}
              value={form.ubicacion}
              onChange={(v) => setField('ubicacion', v)}
              style={inp(t)}
            />
          </Field>
          <Field t={t} label="Elaborador">
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
        </div>
        <Field t={t} label="Orden del día">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(form.orden_items || []).map((it, idx) => (
              <div key={it.key ?? idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={!!it.hecho}
                  onChange={(e) => {
                    const next = [...form.orden_items]
                    next[idx] = { ...it, hecho: e.target.checked }
                    setField('orden_items', next)
                  }}
                />
                <input
                  value={it.texto}
                  placeholder={`Punto ${idx + 1}`}
                  onChange={(e) => {
                    const next = [...form.orden_items]
                    next[idx] = { ...it, texto: e.target.value }
                    setField('orden_items', next)
                  }}
                  style={{ ...inp(t), flex: 1 }}
                />
                <button
                  type="button"
                  style={ghost(t)}
                  onClick={() => setField('orden_items', form.orden_items.filter((_, i) => i !== idx))}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              style={ghost(t)}
              onClick={() => setField('orden_items', [...form.orden_items, { texto: '', hecho: false, key: Date.now() }])}
            >
              + Agregar punto
            </button>
          </div>
        </Field>
      </section>

      <section style={card(t)}>
        <h3 style={h3(t)}>Compromisos abiertos de actas anteriores</h3>
        {previos.length === 0 ? (
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>No hay compromisos abiertos previos.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {previos.map((c) => (
              <div key={c.id} style={{
                display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
                padding: '8px 10px', borderRadius: 8,
                borderLeft: `4px solid ${ORIGEN_COLOR.compromiso.border}`,
                background: ORIGEN_COLOR.compromiso.bg,
              }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600, color: t.text, fontSize: 'var(--cc-body)' }}>{c.titulo}</div>
                  <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                    {c.asignado_a_nombre} · vence {fmtFecha(c.fecha_vencimiento)}
                  </div>
                </div>
                {permisos?.editar && (
                  <select
                    value={c.estado_gestion}
                    onChange={async (e) => {
                      const estado = e.target.value
                      try {
                        await api.patchEstado(c.id, estado)
                        setPrevios((list) => list.map((x) => (x.id === c.id ? { ...x, estado_gestion: estado } : x)))
                      } catch (err) {
                        setError(err.message)
                      }
                    }}
                    style={{ ...inp(t), width: 'auto' }}
                  >
                    {ESTADOS.filter((x) => x.value).map((x) => (
                      <option key={x.value} value={x.value}>{x.label}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={card(t)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={h3(t)}>Asistentes</h3>
          <button
            type="button"
            style={ghost(t)}
            onClick={() => setField('asistentes', [...form.asistentes, { nombre: '', cargo: '', entidad: '', email: '', usuario_id: null }])}
          >
            + Asistente
          </button>
        </div>
        {form.asistentes.map((a, idx) => (
          <div key={idx} style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(180px,2fr) 1fr 1fr 1.2fr auto',
            gap: 8, marginBottom: 10, alignItems: 'start',
          }}>
            <UserSearchSelect
              t={t}
              usuarios={usuariosContrato}
              mode="free"
              valueId={a.usuario_id}
              valueNombre={a.nombre}
              placeholder="Buscar o digitar nombre…"
              style={inp(t)}
              onSelect={(u) => {
                const next = [...form.asistentes]
                next[idx] = {
                  ...a,
                  usuario_id: u.id,
                  nombre: nombreUser(u),
                  cargo: u.cargo_nombre || a.cargo || '',
                  entidad: u.empresa || a.entidad || '',
                  email: u.email || a.email || '',
                }
                setField('asistentes', next)
              }}
              onFreeConfirm={({ nombre }) => {
                const next = [...form.asistentes]
                next[idx] = { ...a, usuario_id: null, nombre }
                setField('asistentes', next)
              }}
            />
            <input placeholder="Cargo" value={a.cargo} onChange={(e) => {
              const next = [...form.asistentes]; next[idx] = { ...a, cargo: e.target.value }; setField('asistentes', next)
            }} style={inp(t)} />
            <input placeholder="Entidad / empresa" value={a.entidad} onChange={(e) => {
              const next = [...form.asistentes]; next[idx] = { ...a, entidad: e.target.value }; setField('asistentes', next)
            }} style={inp(t)} />
            <input placeholder="Correo" value={a.email || ''} onChange={(e) => {
              const next = [...form.asistentes]; next[idx] = { ...a, email: e.target.value }; setField('asistentes', next)
            }} style={inp(t)} />
            <div style={{ display: 'flex', gap: 4 }}>
              {localActaId && a.id && permisos?.validar && (
                <button type="button" title="Firmar con firma de perfil" onClick={() => firmar(a.id)} style={ghost(t)}>✎</button>
              )}
              <button type="button" onClick={() => {
                setField('asistentes', form.asistentes.filter((_, i) => i !== idx))
              }} style={ghost(t)}>✕</button>
            </div>
          </div>
        ))}
      </section>

      <section style={card(t)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={h3(t)}>Ideas centrales</h3>
          <button
            type="button"
            style={primary(t)}
            onClick={() => setField('ideas', [...form.ideas, { texto: '' }])}
          >
            + Agregar idea
          </button>
        </div>
        {form.ideas.map((idea, idx) => (
          <div key={idea.id || idx} style={{
            marginTop: 10, padding: 12, borderRadius: 8, border: `1px solid ${t.border}`,
          }}>
            <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.primary, marginBottom: 6 }}>
              Idea {idx + 1}{idea.id ? ` · #${idea.id}` : ''}
            </div>
            <textarea
              rows={4}
              value={idea.texto}
              onChange={(e) => {
                const next = [...form.ideas]
                next[idx] = { ...idea, texto: e.target.value }
                setField('ideas', next)
              }}
              style={inp(t)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" style={ghost(t)} onClick={() => setClaraIdx(idx)}>
                Redactar con Clara
              </button>
              {permisos?.crear && (
                <button
                  type="button"
                  style={ghost(t)}
                  disabled={saving || !(idea.texto || '').trim()}
                  onClick={() => abrirCompromiso(idx, idea.texto)}
                >
                  Generar compromiso
                </button>
              )}
              <button
                type="button"
                style={ghost(t)}
                onClick={() => setField('ideas', form.ideas.filter((_, i) => i !== idx))}
              >
                Quitar
              </button>
            </div>
          </div>
        ))}
      </section>

      <section style={card(t)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={h3(t)}>Apartados adicionales</h3>
          <button
            type="button"
            style={ghost(t)}
            onClick={() => setField('apartados', [...form.apartados, { titulo: '', contenido: '' }])}
          >
            + Apartado
          </button>
        </div>
        {form.apartados.map((ap, idx) => (
          <div key={idx} style={{ marginTop: 8 }}>
            <input
              placeholder="Título"
              value={ap.titulo}
              onChange={(e) => {
                const next = [...form.apartados]; next[idx] = { ...ap, titulo: e.target.value }; setField('apartados', next)
              }}
              style={{ ...inp(t), marginBottom: 6 }}
            />
            <textarea
              rows={3}
              placeholder="Contenido libre"
              value={ap.contenido}
              onChange={(e) => {
                const next = [...form.apartados]; next[idx] = { ...ap, contenido: e.target.value }; setField('apartados', next)
              }}
              style={inp(t)}
            />
          </div>
        ))}
      </section>

      {pdfUrl && (
        <section style={card(t)}>
          <h3 style={h3(t)}>Vista previa PDF</h3>
          <iframe title="PDF acta" src={pdfUrl} style={{ width: '100%', height: 480, border: `1px solid ${t.border}`, borderRadius: 8 }} />
        </section>
      )}

      {claraIdx != null && (
        <IdeaClaraModal
          t={t}
          api={api}
          textoInicial={form.ideas[claraIdx]?.texto || ''}
          onClose={() => setClaraIdx(null)}
          onEnviarAlActa={(texto) => {
            const next = [...form.ideas]
            next[claraIdx] = { ...next[claraIdx], texto }
            setField('ideas', next)
            setClaraIdx(null)
          }}
          onGenerarCompromiso={async (texto) => {
            const idx = claraIdx
            const next = [...form.ideas]
            next[idx] = { ...next[idx], texto }
            setField('ideas', next)
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
            setOkMsg('Compromiso incorporado a la bandeja unificada.')
          }}
        />
      )}
    </div>
  )
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
