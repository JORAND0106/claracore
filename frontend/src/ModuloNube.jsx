import { useEffect, useState } from 'react'
import { fetchConFallback } from './fetchConFallback'

function perm(u, nombreLower, campo) {
  if (!u) return false
  if ((u.cargo_nombre || '').toLowerCase() === 'desarrollador') return true
  const p = (u.permisos || []).find((x) => (x.funcion_nombre || '').toLowerCase() === nombreLower)
  return !!(p && p[campo])
}

/** Panel admin: conectar Google u OneDrive con tokens (p. ej. desde OAuth Playground). */
export default function ModuloNube({ usuario, t, contratos }) {
  const puede = perm(usuario, 'integración nube claracore', 'editar')
  const puedeVer = perm(usuario, 'integración nube claracore', 'ver')
  const [cid, setCid] = useState(usuario?.contrato_id || '')
  const [proveedor, setProveedor] = useState('google')
  const [access, setAccess] = useState('')
  const [refresh, setRefresh] = useState('')
  const [estado, setEstado] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (usuario?.contrato_id) setCid(usuario.contrato_id)
  }, [usuario?.contrato_id])

  async function cargarEstado() {
    if (!cid) return
    const r = await fetchConFallback(`/nube/${cid}/estado`)
    if (!r?._error) setEstado(r)
  }

  useEffect(() => { if (puedeVer && cid) cargarEstado() }, [cid, puedeVer])

  async function conectar() {
    setMsg('')
    const path =
      proveedor === 'google' ? `/nube/${cid}/conectar-google` : `/nube/${cid}/conectar-onedrive`
    const r = await fetchConFallback(path, {
      method: 'POST',
      body: { proveedor, access_token: access, refresh_token: refresh || null, expires_in: 3600 },
    })
    if (r?._error) setMsg(String(r.detail))
    else { setMsg('Carpetas creadas.'); cargarEstado() }
  }

  async function desconectar() {
    const r = await fetchConFallback(`/nube/${cid}/desconectar?proveedor=${proveedor}`, { method: 'POST' })
    if (r?._error) setMsg(String(r.detail))
    else cargarEstado()
  }

  if (!puedeVer) {
    return <div style={{ color: t.textMuted }}>Sin permiso «Integración nube ClaraCore».</div>
  }

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }

  return (
    <div style={{ color: t.text, fontSize: 'var(--cc-sm)' }}>
      <h3 style={{ color: t.primary }}>Integración nube (Drive / OneDrive)</h3>
      <p style={{ color: t.textMuted }}>Pega <code>access_token</code> y opcionalmente <code>refresh_token</code> tras flujo OAuth.</p>
      {msg && <div style={{ ...card, background: '#FEF3C7', color: '#92400E' }}>{msg}</div>}
      <div style={card}>
        <label style={{ display: 'block', marginBottom: 8 }}>Contrato</label>
        <select value={cid} onChange={(e) => setCid(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 12 }}>
          {(contratos || []).map((c) => (
            <option key={c.id} value={c.id}>{c.numero}</option>
          ))}
        </select>
        <label style={{ display: 'block', marginBottom: 8 }}>Proveedor</label>
        <select value={proveedor} onChange={(e) => setProveedor(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 12 }}>
          <option value="google">Google Drive</option>
          <option value="onedrive">OneDrive</option>
        </select>
        <textarea placeholder="Access token" value={access} onChange={(e) => setAccess(e.target.value)} style={{ width: '100%', minHeight: 70, marginBottom: 8 }} />
        <textarea placeholder="Refresh token (recomendado)" value={refresh} onChange={(e) => setRefresh(e.target.value)} style={{ width: '100%', minHeight: 50, marginBottom: 8 }} />
        {puede && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={conectar} style={{ padding: '10px 18px', background: t.primary, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Conectar y crear carpetas
            </button>
            <button type="button" onClick={desconectar} style={{ padding: '10px 18px', border: `1px solid ${t.border}`, borderRadius: 8, cursor: 'pointer', background: 'transparent', color: t.text }}>
              Desactivar
            </button>
            <button type="button" onClick={cargarEstado} style={{ padding: '10px 18px', border: `1px solid ${t.border}`, borderRadius: 8, cursor: 'pointer' }}>
              Refrescar estado
            </button>
          </div>
        )}
      </div>
      {estado && (
        <pre style={{ ...card, overflow: 'auto', fontSize: 'var(--cc-label)' }}>{JSON.stringify(estado, null, 2)}</pre>
      )}
    </div>
  )
}
