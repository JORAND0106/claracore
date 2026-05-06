import { useCallback, useEffect, useState } from 'react'
import { fetchConFallback } from './fetchConFallback'

function perm(usuario, nombreLower, campo) {
  if (!usuario) return false
  if ((usuario.cargo_nombre || '').toLowerCase() === 'desarrollador') return true
  const p = (usuario.permisos || []).find((x) => (x.funcion_nombre || '').toLowerCase() === nombreLower)
  return !!(p && p[campo])
}

export default function ModuloEnsayos({ usuario, t }) {
  const cid = usuario?.contrato_id
  const puedeVer = perm(usuario, 'ensayos pip', 'ver')
  const puedeCrear = perm(usuario, 'ensayos pip', 'crear')
  const puedeValidar = perm(usuario, 'ensayos pip', 'validar')
  const [tab, setTab] = useState('pip')
  const [pips, setPips] = useState([])
  const [regs, setRegs] = useState([])
  const [cumplimiento, setCumplimiento] = useState(null)
  const [msg, setMsg] = useState('')
  const [pipForm, setPipForm] = useState({
    nombre_ensayo: '',
    norma_tecnica: '',
    item_presupuesto: '',
    frecuencia_tipo: 'por_dias',
    frecuencia_valor: 30,
    cantidad_minima: 1,
  })
  const [regForm, setRegForm] = useState({
    pip_id: '',
    fecha_muestra: '',
    laboratorio: '',
    resultado_tipo: 'pasa',
    resultado_valor: '',
    mes_registro: '',
    nombre_muestra: 'Muestra',
    file: null,
  })

  const load = useCallback(async () => {
    if (!cid || !puedeVer) return
    const [p, r, c] = await Promise.all([
      fetchConFallback(`/ensayos/${cid}/pip`),
      fetchConFallback(`/ensayos/${cid}/registros`),
      fetchConFallback(`/ensayos/${cid}/cumplimiento`),
    ])
    if (!p?._error) setPips(Array.isArray(p) ? p : [])
    if (!r?._error) setRegs(Array.isArray(r) ? r : [])
    if (!c?._error) setCumplimiento(c)
  }, [cid, puedeVer])

  useEffect(() => { load() }, [load])

  if (!cid) return <div style={{ color: t.textMuted }}>Selecciona un contrato.</div>
  if (!puedeVer) return <div style={{ color: t.textMuted }}>Sin permiso «Ensayos PIP» (ver).</div>

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }

  async function crearPip(e) {
    e.preventDefault()
    const body = { ...pipForm, frecuencia_valor: Number(pipForm.frecuencia_valor) }
    const r = await fetchConFallback(`/ensayos/${cid}/pip`, { method: 'POST', body })
    if (r?._error) setMsg(String(r.detail))
    else {
      setMsg('')
      setPipForm({
        nombre_ensayo: '',
        norma_tecnica: '',
        item_presupuesto: '',
        frecuencia_tipo: 'por_dias',
        frecuencia_valor: 30,
        cantidad_minima: 1,
      })
      load()
    }
  }

  async function subirReg(e) {
    e.preventDefault()
    if (!regForm.file || !regForm.pip_id) { setMsg('PIP y archivo requeridos'); return }
    const fd = new FormData()
    fd.append('pip_id', regForm.pip_id)
    fd.append('fecha_muestra', regForm.fecha_muestra)
    fd.append('mes_registro', regForm.mes_registro)
    fd.append('nombre_muestra', regForm.nombre_muestra)
    if (regForm.laboratorio) fd.append('laboratorio', regForm.laboratorio)
    if (regForm.resultado_tipo) fd.append('resultado_tipo', regForm.resultado_tipo)
    if (regForm.resultado_valor !== '') fd.append('resultado_valor', String(regForm.resultado_valor))
    fd.append('file', regForm.file)
    const r = await fetchConFallback(`/ensayos/${cid}/registros`, { method: 'POST', body: fd })
    if (r?._error) setMsg(String(r.detail))
    else { setMsg(''); load() }
  }

  async function revisarReg(id, estado) {
    const comentario = window.prompt('Comentario:') || ''
    const r = await fetchConFallback(`/ensayos/${cid}/registros/${id}/revisar`, { method: 'PUT', body: { estado, comentario } })
    if (r?._error) setMsg(String(r.detail))
    else load()
  }

  return (
    <div style={{ color: t.text, fontSize: 'var(--cc-sm)' }}>
      <h2 style={{ fontSize: 'var(--cc-h2)', color: t.primary }}>Ensayos de laboratorio (PIP)</h2>
      {msg && <div style={{ ...card, color: '#B91C1C', background: '#FEF2F2' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          ['pip', 'PIP'],
          ['reg', 'Registros'],
          ['cum', 'Cumplimiento'],
        ].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${tab === k ? t.primary : t.border}`,
              background: tab === k ? t.primary + '22' : 'transparent',
              color: tab === k ? t.primary : t.textMuted,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'cum' && cumplimiento && (
        <div style={card}>
          {(cumplimiento.items || []).map((it) => (
            <div key={it.pip_id} style={{ marginBottom: 10, borderBottom: `1px solid ${t.border}`, paddingBottom: 8 }}>
              <strong>{it.nombre_ensayo}</strong> — registros {it.registros_total}, aprobados {it.registros_aprobados}, fallas {it.fallas}.
              {it.cumple_minimo ? ' ✓ mínimo' : ' ⚠ bajo mínimo'}
            </div>
          ))}
        </div>
      )}

      {tab === 'pip' && (
        <>
          {puedeCrear && (
            <form style={card} onSubmit={crearPip}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Nuevo PIP</div>
              <input required placeholder="Nombre ensayo" value={pipForm.nombre_ensayo} onChange={(e) => setPipForm((f) => ({ ...f, nombre_ensayo: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} />
              <input placeholder="Norma" value={pipForm.norma_tecnica} onChange={(e) => setPipForm((f) => ({ ...f, norma_tecnica: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} />
              <input placeholder="Ítem presupuesto" value={pipForm.item_presupuesto} onChange={(e) => setPipForm((f) => ({ ...f, item_presupuesto: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} />
              <button type="submit" style={{ padding: '8px 16px', background: t.primary, color: '#fff', border: 'none', borderRadius: 8 }}>Crear PIP</button>
            </form>
          )}
          <div style={card}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Planes</div>
            {pips.map((p) => (
              <div key={p.id} style={{ marginBottom: 6 }}>{p.nombre_ensayo} · id {p.id}</div>
            ))}
          </div>
        </>
      )}

      {tab === 'reg' && (
        <>
          {puedeCrear && (
            <form style={card} onSubmit={subirReg}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Nuevo registro + certificado</div>
              <select required value={regForm.pip_id} onChange={(e) => setRegForm((f) => ({ ...f, pip_id: e.target.value }))} style={{ width: '100%', marginBottom: 8 }}>
                <option value="">— PIP —</option>
                {pips.map((p) => <option key={p.id} value={p.id}>{p.nombre_ensayo}</option>)}
              </select>
              <input type="date" required value={regForm.fecha_muestra} onChange={(e) => setRegForm((f) => ({ ...f, fecha_muestra: e.target.value }))} style={{ width: '100%', marginBottom: 8 }} />
              <input placeholder="YYYY-MM mes registro" required value={regForm.mes_registro} onChange={(e) => setRegForm((f) => ({ ...f, mes_registro: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} />
              <input placeholder="Laboratorio" value={regForm.laboratorio} onChange={(e) => setRegForm((f) => ({ ...f, laboratorio: e.target.value }))} style={{ width: '100%', marginBottom: 8, padding: 8 }} />
              <select value={regForm.resultado_tipo} onChange={(e) => setRegForm((f) => ({ ...f, resultado_tipo: e.target.value }))} style={{ width: '100%', marginBottom: 8 }}>
                <option value="pasa">pasa</option>
                <option value="falla">falla</option>
              </select>
              <input type="file" required onChange={(e) => setRegForm((f) => ({ ...f, file: e.target.files?.[0] || null }))} />
              <button type="submit" style={{ marginTop: 8, padding: '8px 16px', background: t.primary, color: '#fff', border: 'none', borderRadius: 8 }}>Subir</button>
            </form>
          )}
          <div style={card}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Últimos registros</div>
            {regs.slice(0, 40).map((r) => (
              <div key={r.id} style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span>{r.nombre_ensayo} · {r.estado} · {r.fecha_muestra}</span>
                {r.url_nube && <a href={r.url_nube} target="_blank" rel="noreferrer" style={{ color: t.primary }}>Certificado</a>}
                {puedeValidar && (
                  <>
                    <button type="button" style={{ fontSize: 'var(--cc-label)' }} onClick={() => revisarReg(r.id, 'Aprobado')}>Aprobar</button>
                    <button type="button" style={{ fontSize: 'var(--cc-label)' }} onClick={() => revisarReg(r.id, 'Rechazado')}>Rechazar</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
