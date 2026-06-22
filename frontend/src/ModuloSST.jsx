import { useCallback, useEffect, useState } from 'react'
import { fetchConFallback } from './fetchConFallback'
import { esArchivoImagen, prepararImagenParaUpload } from './comprimirImagen'

function permUsuario(u, nombreLower, campo) {
  if (!u) return false
  if ((u.cargo_nombre || '').toLowerCase() === 'desarrollador') return true
  const p = (u.permisos || []).find((x) => (x.funcion_nombre || '').toLowerCase() === nombreLower)
  return !!(p && p[campo])
}

export default function ModuloSST({ usuario, t }) {
  const contratoId = usuario?.contrato_id
  const puedeVer = permUsuario(usuario, 'sst documental', 'ver')
  const puedeCrear = permUsuario(usuario, 'sst documental', 'crear')
  const puedeValidar = permUsuario(usuario, 'sst documental', 'validar')
  const [tab, setTab] = useState('personal')
  const [personal, setPersonal] = useState([])
  const [maquinaria, setMaquinaria] = useState([])
  const [plantillas, setPlantillas] = useState([])
  const [docs, setDocs] = useState([])
  const [sel, setSel] = useState(null)
  const [checklist, setChecklist] = useState(null)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ nombre: '', cedula: '', cargo: '', empresa_tipo: 'Contratista', subcontratista_id: '' })
  const [maqForm, setMaqForm] = useState({ placa_serial: '', tipo: '', marca: '', modelo: '', empresa_tipo: 'Contratista' })
  const [tplForm, setTplForm] = useState({ tipo: 'personal', nombre: '', dias_vigencia: '', obligatorio: true })
  const [upload, setUpload] = useState({ plantilla_id: '', mes: '', fv: '', file: null })

  const load = useCallback(async () => {
    if (!contratoId || !puedeVer) return
    const [p, m, pl, d] = await Promise.all([
      fetchConFallback(`/sst/${contratoId}/personal`),
      fetchConFallback(`/sst/${contratoId}/maquinaria`),
      fetchConFallback(`/sst/${contratoId}/plantillas`),
      fetchConFallback(`/sst/${contratoId}/documentos`),
    ])
    if (!p?._error) setPersonal(Array.isArray(p) ? p : [])
    if (!m?._error) setMaquinaria(Array.isArray(m) ? m : [])
    if (!pl?._error) setPlantillas(Array.isArray(pl) ? pl : [])
    if (!d?._error) setDocs(Array.isArray(d) ? d : [])
  }, [contratoId, puedeVer])

  useEffect(() => { load() }, [load])

  async function loadChecklist(ent, id) {
    const tipo = ent === 'personal' ? 'personal' : 'maquinaria'
    const r = await fetchConFallback(`/sst/${contratoId}/checklist/${tipo}/${id}`)
    if (!r?._error) setChecklist(r)
  }

  useEffect(() => {
    if (sel && contratoId) loadChecklist(sel.tipo, sel.id)
    else setChecklist(null)
  }, [sel, contratoId])

  if (!contratoId) {
    return <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Selecciona un contrato para usar SST.</div>
  }
  if (!puedeVer) {
    return <div style={{ color: t.textMuted }}>Sin permiso «SST documental» (ver). Configúralo en Admin → Control de accesos.</div>
  }

  async function crearPersonal(e) {
    e.preventDefault()
    setMsg('')
    const body = {
      ...form,
      subcontratista_id: form.subcontratista_id ? parseInt(form.subcontratista_id, 10) : null,
    }
    const r = await fetchConFallback(`/sst/${contratoId}/personal`, { method: 'POST', body })
    if (r?._error) setMsg(r.detail || 'Error')
    else { setForm({ nombre: '', cedula: '', cargo: '', empresa_tipo: 'Contratista', subcontratista_id: '' }); load() }
  }

  async function crearMaquinaria(e) {
    e.preventDefault()
    const r = await fetchConFallback(`/sst/${contratoId}/maquinaria`, { method: 'POST', body: maqForm })
    if (r?._error) setMsg(r.detail || 'Error')
    else { setMaqForm({ placa_serial: '', tipo: '', marca: '', modelo: '', empresa_tipo: 'Contratista' }); load() }
  }

  async function crearPlantilla(e) {
    e.preventDefault()
    const body = {
      ...tplForm,
      dias_vigencia: tplForm.dias_vigencia ? parseInt(tplForm.dias_vigencia, 10) : null,
      tiene_vencimiento: !!tplForm.dias_vigencia,
    }
    const r = await fetchConFallback(`/sst/${contratoId}/plantillas`, { method: 'POST', body })
    if (r?._error) setMsg(r.detail || 'Error')
    else { setTplForm({ tipo: 'personal', nombre: '', dias_vigencia: '', obligatorio: true }); load() }
  }

  async function subirDoc(e) {
    e.preventDefault()
    if (!upload.file || !upload.plantilla_id || !sel) { setMsg('Completa plantilla, archivo y selección.'); return }
    const fd = new FormData()
    fd.append('plantilla_id', upload.plantilla_id)
    fd.append('entidad_tipo', tab === 'personal' ? 'personal' : 'maquinaria')
    fd.append('entidad_id', String(sel.id))
    fd.append('mes_vigencia', upload.mes)
    if (upload.fv) fd.append('fecha_vigencia', upload.fv)
    const archivo = esArchivoImagen(upload.file)
      ? await prepararImagenParaUpload(upload.file)
      : upload.file
    fd.append('file', archivo)
    const r = await fetchConFallback(`/sst/${contratoId}/documentos`, { method: 'POST', body: fd })
    if (r?._error) setMsg(typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail))
    else { setUpload({ plantilla_id: '', mes: '', fv: '', file: null }); load(); loadChecklist(sel.tipo, sel.id) }
  }

  async function revisar(docId, estado) {
    const comentario = window.prompt('Comentario (opcional):') || ''
    const r = await fetchConFallback(`/sst/${contratoId}/documentos/${docId}/revisar`, {
      method: 'PUT',
      body: { estado, comentario },
    })
    if (r?._error) setMsg(r.detail || 'Error')
    else load()
  }

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }

  return (
    <div style={{ color: t.text, fontSize: 'var(--cc-sm)' }}>
      <h2 style={{ fontSize: 'var(--cc-h2)', color: t.primary, margin: '0 0 8px' }}>SST — Documental</h2>
      <p style={{ color: t.textMuted, marginBottom: 16 }}>Personal y maquinaria, plantillas y revisión interventoría.</p>
      {msg && <div style={{ ...card, background: '#FEF2F2', color: '#B91C1C' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['personal', 'maquinaria'].map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => { setTab(x); setSel(null) }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${tab === x ? t.primary : t.border}`,
              background: tab === x ? t.primary + '22' : 'transparent',
              color: tab === x ? t.primary : t.textMuted,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 'var(--cc-sm)',
            }}
          >
            {x === 'personal' ? 'Personal' : 'Maquinaria'}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Listado</div>
          {(tab === 'personal' ? personal : maquinaria).map((row) => (
            <div
              key={row.id}
              onClick={() => setSel({ tipo: tab, id: row.id, row })}
              role="button"
              tabIndex={0}
              onKeyDown={() => {}}
              style={{
                padding: 8,
                borderRadius: 8,
                marginBottom: 6,
                cursor: 'pointer',
                background: sel?.id === row.id ? t.primary + '18' : t.inputBg,
                border: `1px solid ${sel?.id === row.id ? t.primary : t.border}`,
              }}
            >
              {tab === 'personal' ? (
                <>{row.nombre} · CC {row.cedula}</>
              ) : (
                <>{row.placa_serial} · {row.tipo || '—'}</>
              )}
            </div>
          ))}
        </div>

        <div style={card}>
          {sel ? (
            <>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Detalle / checklist</div>
              {checklist && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ marginBottom: 6 }}>Semáforo: <strong>{checklist.semaforo_global}</strong></div>
                  {(checklist.items || []).map((it, i) => (
                    <div key={i} style={{ fontSize: 'var(--cc-label)', marginBottom: 4, color: t.textMuted }}>
                      {it.plantilla?.nombre}: <span style={{ color: t.text }}>{it.semaforo}</span>{' '}
                      {it.documento?.estado}
                    </div>
                  ))}
                </div>
              )}
              {puedeValidar && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Documentos recientes</div>
                  {docs.filter((d) => d.entidad_id === sel.id && d.entidad_tipo === (tab === 'personal' ? 'personal' : 'maquinaria')).slice(0, 8).map((d) => (
                    <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ flex: 1 }}>{d.nombre_archivo} — {d.estado}</span>
                      {d.url_nube && <a href={d.url_nube} target="_blank" rel="noopener noreferrer" style={{ color: t.primary }}>Abrir</a>}
                      <button type="button" style={{ fontSize: 'var(--cc-label)', padding: '4px 8px' }} onClick={() => revisar(d.id, 'Aprobado')}>Aprobar</button>
                      <button type="button" style={{ fontSize: 'var(--cc-label)', padding: '4px 8px' }} onClick={() => revisar(d.id, 'Rechazado')}>Rechazar</button>
                    </div>
                  ))}
                </div>
              )}
              {puedeCrear && (
                <form onSubmit={subirDoc} style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Subir documento (requiere nube)</div>
                  <select value={upload.plantilla_id} onChange={(e) => setUpload((u) => ({ ...u, plantilla_id: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }}>
                    <option value="">— Plantilla —</option>
                    {plantillas.filter((p) => p.tipo === tab).map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                  <input placeholder="Mes vigencia YYYY-MM" value={upload.mes} onChange={(e) => setUpload((u) => ({ ...u, mes: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} />
                  <input type="date" value={upload.fv} onChange={(e) => setUpload((u) => ({ ...u, fv: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} />
                  <input type="file" onChange={(e) => setUpload((u) => ({ ...u, file: e.target.files?.[0] || null }))} />
                  <button type="submit" style={{ marginTop: 8, padding: '8px 16px', background: t.primary, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Subir</button>
                </form>
              )}
            </>
          ) : (
            <div style={{ color: t.textMuted }}>Selecciona una fila.</div>
          )}
        </div>
      </div>

      {puedeCrear && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16, marginTop: 16 }}>
          <form style={card} onSubmit={crearPlantilla}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Nueva plantilla</div>
            <select value={tplForm.tipo} onChange={(e) => setTplForm((f) => ({ ...f, tipo: e.target.value }))} style={{ width: '100%', marginBottom: 8 }}>
              <option value="personal">personal</option>
              <option value="maquinaria">maquinaria</option>
            </select>
            <input placeholder="Nombre" value={tplForm.nombre} onChange={(e) => setTplForm((f) => ({ ...f, nombre: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} required />
            <input placeholder="Días vigencia (opc.)" value={tplForm.dias_vigencia} onChange={(e) => setTplForm((f) => ({ ...f, dias_vigencia: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} />
            <button type="submit" style={{ padding: '8px 16px', background: t.primary, color: '#fff', border: 'none', borderRadius: 8 }}>Guardar plantilla</button>
          </form>

          {tab === 'personal' ? (
            <form style={card} onSubmit={crearPersonal}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Alta personal</div>
              <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} required />
              <input placeholder="Cédula" value={form.cedula} onChange={(e) => setForm((f) => ({ ...f, cedula: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} required />
              <input placeholder="Cargo" value={form.cargo} onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} />
              <select value={form.empresa_tipo} onChange={(e) => setForm((f) => ({ ...f, empresa_tipo: e.target.value }))} style={{ width: '100%', marginBottom: 8 }}>
                <option value="Contratista">Contratista</option>
                <option value="Subcontratista">Subcontratista</option>
              </select>
              <button type="submit" style={{ padding: '8px 16px', background: t.primary, color: '#fff', border: 'none', borderRadius: 8 }}>Guardar</button>
            </form>
          ) : (
            <form style={card} onSubmit={crearMaquinaria}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Alta maquinaria</div>
              <input placeholder="Placa / serial" value={maqForm.placa_serial} onChange={(e) => setMaqForm((f) => ({ ...f, placa_serial: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} required />
              <input placeholder="Tipo" value={maqForm.tipo} onChange={(e) => setMaqForm((f) => ({ ...f, tipo: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} />
              <select value={maqForm.empresa_tipo} onChange={(e) => setMaqForm((f) => ({ ...f, empresa_tipo: e.target.value }))} style={{ width: '100%', marginBottom: 8 }}>
                <option value="Contratista">Contratista</option>
                <option value="Subcontratista">Subcontratista</option>
              </select>
              <button type="submit" style={{ padding: '8px 16px', background: t.primary, color: '#fff', border: 'none', borderRadius: 8 }}>Guardar</button>
            </form>
          )}
        </div>
      )}

      {sel && puedeCrear && (
        <div style={{ marginTop: 12, fontSize: 'var(--cc-label)', color: t.textMuted }}>
          Informe HTML: GET /sst/{contratoId}/informe/{tab === 'personal' ? 'personal' : 'maquinaria'}/{sel.id} con el mismo token de sesión.
        </div>
      )}
    </div>
  )
}
