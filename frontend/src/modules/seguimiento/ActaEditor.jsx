import { useEffect, useState } from 'react'
import CompromisoFormModal from './CompromisoFormModal'
import IdeaClaraModal from './IdeaClaraModal'
import { ESTADOS, ORIGEN_COLOR, fmtFecha } from './seguimientoTheme'

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
  const [consecutivo, setConsecutivo] = useState(null)
  const [previos, setPrevios] = useState([])
  const [form, setForm] = useState({
    fecha_reunion: new Date().toISOString().slice(0, 10),
    ubicacion: '',
    orden_del_dia: '',
    elaborador_id: usuario?.id || null,
    elaborador_nombre: nombre(usuario),
    asistentes: [{ nombre: '', cargo: '', entidad: '' }],
    ideas: [{ texto: '' }],
    apartados: [{ titulo: '', contenido: '' }],
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
          setConsecutivo(a.consecutivo)
          setForm({
            fecha_reunion: String(a.fecha_reunion || '').slice(0, 10),
            ubicacion: a.ubicacion || '',
            orden_del_dia: a.orden_del_dia || '',
            elaborador_id: a.elaborador_id,
            elaborador_nombre: a.elaborador_nombre || '',
            asistentes: (a.asistentes || []).length
              ? a.asistentes.map((x) => ({
                id: x.id, nombre: x.nombre || '', cargo: x.cargo || '', entidad: x.entidad || '', usuario_id: x.usuario_id,
              }))
              : [{ nombre: '', cargo: '', entidad: '' }],
            ideas: (a.ideas || []).length
              ? a.ideas.map((x) => ({ id: x.id, texto: x.texto || '', orden: x.orden }))
              : [{ texto: '' }],
            apartados: (a.apartados || []).length
              ? a.apartados.map((x) => ({ id: x.id, titulo: x.titulo || '', contenido: x.contenido || '' }))
              : [{ titulo: '', contenido: '' }],
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

  const guardar = async () => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        asistentes: form.asistentes.filter((a) => a.nombre.trim()),
        ideas: form.ideas.filter((i) => (i.texto || '').trim() || i.id),
        apartados: form.apartados.filter((a) => (a.titulo || a.contenido || '').trim()),
      }
      const row = actaId
        ? await api.updateActa(actaId, payload)
        : await api.createActa(payload)
      onSaved?.(row)
    } catch (e) {
      setError(e.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const previewPdf = async () => {
    if (!actaId) {
      setError('Guarde el acta antes de generar la vista previa PDF.')
      return
    }
    try {
      const blob = await api.pdfActaBlob(actaId)
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      setPdfUrl(URL.createObjectURL(blob))
    } catch (e) {
      setError(e.message || 'No se pudo generar PDF')
    }
  }

  const firmar = async (asistenteId) => {
    try {
      await api.firmarActa(actaId, asistenteId)
      const a = await api.getActa(actaId)
      setForm((f) => ({
        ...f,
        asistentes: (a.asistentes || []).map((x) => ({
          id: x.id, nombre: x.nombre || '', cargo: x.cargo || '', entidad: x.entidad || '', usuario_id: x.usuario_id,
        })),
      }))
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
            Numeración consecutiva del contrato · hereda tema y tipografía de la plataforma
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={onCancel} style={ghost(t)}>Volver</button>
          {actaId && (
            <button type="button" onClick={previewPdf} style={ghost(t)}>Vista previa PDF</button>
          )}
          {(permisos?.crear || permisos?.editar) && (
            <button type="button" disabled={saving} onClick={guardar} style={primary(t)}>
              {saving ? 'Guardando…' : (actaId ? 'Guardar cambios' : 'Crear acta')}
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

      {/* Encabezado */}
      <section style={card(t)}>
        <h3 style={h3(t)}>Encabezado</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <Field t={t} label="Fecha de la reunión">
            <input type="date" value={form.fecha_reunion} onChange={(e) => setField('fecha_reunion', e.target.value)} style={inp(t)} />
          </Field>
          <Field t={t} label="Ubicación">
            <input value={form.ubicacion} onChange={(e) => setField('ubicacion', e.target.value)} style={inp(t)} />
          </Field>
          <Field t={t} label="Elaborador">
            <input value={form.elaborador_nombre} onChange={(e) => setField('elaborador_nombre', e.target.value)} style={inp(t)} />
          </Field>
        </div>
        <Field t={t} label="Orden del día">
          <textarea rows={3} value={form.orden_del_dia} onChange={(e) => setField('orden_del_dia', e.target.value)} style={inp(t)} />
        </Field>
      </section>

      {/* Compromisos previos abiertos */}
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

      {/* Asistentes */}
      <section style={card(t)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={h3(t)}>Asistentes</h3>
          <button
            type="button"
            style={ghost(t)}
            onClick={() => setField('asistentes', [...form.asistentes, { nombre: '', cargo: '', entidad: '' }])}
          >
            + Asistente
          </button>
        </div>
        {form.asistentes.map((a, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.4fr auto', gap: 8, marginBottom: 8 }}>
            <input placeholder="Nombre" value={a.nombre} onChange={(e) => {
              const next = [...form.asistentes]; next[idx] = { ...a, nombre: e.target.value }; setField('asistentes', next)
            }} style={inp(t)} />
            <input placeholder="Cargo" value={a.cargo} onChange={(e) => {
              const next = [...form.asistentes]; next[idx] = { ...a, cargo: e.target.value }; setField('asistentes', next)
            }} style={inp(t)} />
            <input placeholder="Entidad / empresa" value={a.entidad} onChange={(e) => {
              const next = [...form.asistentes]; next[idx] = { ...a, entidad: e.target.value }; setField('asistentes', next)
            }} style={inp(t)} />
            <div style={{ display: 'flex', gap: 4 }}>
              {actaId && a.id && permisos?.validar && (
                <button type="button" title="Firmar con firma de perfil" onClick={() => firmar(a.id)} style={ghost(t)}>✎</button>
              )}
              <button type="button" onClick={() => {
                setField('asistentes', form.asistentes.filter((_, i) => i !== idx))
              }} style={ghost(t)}>✕</button>
            </div>
          </div>
        ))}
      </section>

      {/* Ideas centrales */}
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
              Idea {idx + 1}
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
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" style={ghost(t)} onClick={() => setClaraIdx(idx)}>
                Redactar con Clara
              </button>
              {actaId && idea.id && permisos?.crear && (
                <button
                  type="button"
                  style={ghost(t)}
                  onClick={() => setCompromisoCtx({ ideaId: idea.id, texto: idea.texto })}
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

      {/* Apartados libres */}
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
          onGenerarCompromiso={(texto) => {
            const idea = form.ideas[claraIdx]
            const next = [...form.ideas]
            next[claraIdx] = { ...idea, texto }
            setField('ideas', next)
            const ideaId = idea?.id
            setClaraIdx(null)
            if (!actaId || !ideaId) {
              setError('Guarde el acta (para obtener id de idea) antes de generar el compromiso.')
              return
            }
            setCompromisoCtx({ ideaId, texto })
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
            await api.crearCompromiso(actaId, compromisoCtx.ideaId, body)
            setCompromisoCtx(null)
            setError('')
            alert('Compromiso incorporado a la bandeja unificada.')
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
