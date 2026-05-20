/**
 * Dependencias globales del contrato — panel lateral del mapa.
 * Secuencia capítulo→capítulo que aplica a todos los PKs con ambos capítulos programados.
 */
import { useCallback, useEffect, useState } from 'react'
import { Trash2, Plus, AlertCircle, Globe } from 'lucide-react'
import ProgObraDepAyuda, { DepAyudaButton } from './ProgObraDepAyuda'

const TIPOS = [
  { value: 'FS', label: 'FS', desc: 'Finish-Start: el destino empieza cuando el origen termina' },
  { value: 'SS', label: 'SS', desc: 'Start-Start: el destino empieza cuando el origen empieza' },
  { value: 'FF', label: 'FF', desc: 'Finish-Finish: el destino termina cuando el origen termina' },
  { value: 'SF', label: 'SF', desc: 'Start-Finish: el destino termina cuando el origen empieza' },
]

const inputStyle = (t) => ({
  padding: '5px 8px',
  fontSize: 'var(--cc-sm)',
  border: `1px solid ${t.border}`,
  borderRadius: 6,
  background: t.bgCard,
  color: t.text,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
})

function TipoBadge({ tipo, t }) {
  const colors = {
    FS: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
    SS: { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
    FF: { bg: '#FFF7ED', text: '#9A3412', border: '#FED7AA' },
    SF: { bg: '#FDF4FF', text: '#6B21A8', border: '#E9D5FF' },
  }
  const c = colors[tipo] || { bg: t.bg, text: t.text, border: t.border }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
      }}
    >
      {tipo}
    </span>
  )
}

export default function ProgObraDependenciasGlobales({
  cid,
  token,
  API,
  t,
  versionId,
  editable,
  showToast,
}) {
  const [deps, setDeps] = useState([])
  const [capitulos, setCapitulos] = useState([])
  const [loading, setLoading] = useState(false)
  const [formCapOrigen, setFormCapOrigen] = useState('')
  const [formCapDest, setFormCapDest] = useState('')
  const [formTipo, setFormTipo] = useState('FS')
  const [formLag, setFormLag] = useState('0')
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [ayudaOpen, setAyudaOpen] = useState(false)

  const hdrs = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const cargarCapitulos = useCallback(async () => {
    if (!cid) return
    try {
      const res = await fetch(`${API}/presupuesto/${cid}/capitulos-lista`, { headers: hdrs })
      if (!res.ok) return
      const rows = await res.json()
      const caps = (rows || []).map((r) => String(r.capitulo || '').trim()).filter(Boolean)
      setCapitulos(caps)
      setFormCapOrigen((prev) => prev || caps[0] || '')
      setFormCapDest((prev) => prev || caps[1] || caps[0] || '')
    } catch {
      /* silencioso */
    }
  }, [cid, API, token])

  const cargarDependencias = useCallback(async () => {
    if (!versionId) {
      setDeps([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `${API}/prog-obra/${cid}/versiones/${versionId}/dependencias-globales`,
        { headers: hdrs },
      )
      if (res.ok) setDeps(await res.json())
    } catch {
      /* silencioso */
    } finally {
      setLoading(false)
    }
  }, [versionId, cid, API, token])

  useEffect(() => {
    cargarCapitulos()
  }, [cargarCapitulos])

  useEffect(() => {
    cargarDependencias()
  }, [cargarDependencias])

  const handleAgregar = async () => {
    setFormError(null)
    if (!formCapOrigen || !formCapDest) {
      setFormError('Seleccione capítulo origen y destino.')
      return
    }
    if (formCapOrigen === formCapDest) {
      setFormError('El capítulo origen y destino deben ser distintos.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(
        `${API}/prog-obra/${cid}/versiones/${versionId}/dependencias-globales`,
        {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify({
            capitulo_origen: formCapOrigen,
            capitulo_destino: formCapDest,
            tipo: formTipo,
            lag_dias: parseInt(formLag, 10) || 0,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) {
        setFormError(data?.detail || 'Error al agregar dependencia global.')
        return
      }
      setDeps((prev) => [...prev, data])
      showToast?.('Dependencia global agregada.', 'ok')
    } catch {
      setFormError('Error de red al agregar dependencia.')
    } finally {
      setSaving(false)
    }
  }

  const handleEliminar = async (depId) => {
    if (!window.confirm('¿Eliminar esta dependencia global?')) return
    setDeletingId(depId)
    try {
      const res = await fetch(
        `${API}/prog-obra/${cid}/versiones/${versionId}/dependencias-globales/${depId}`,
        { method: 'DELETE', headers: hdrs },
      )
      if (!res.ok) {
        showToast?.('Error al eliminar dependencia.', 'err')
        return
      }
      setDeps((prev) => prev.filter((d) => d.id !== depId))
      showToast?.('Dependencia global eliminada.', 'ok')
    } catch {
      showToast?.('Error de red al eliminar.', 'err')
    } finally {
      setDeletingId(null)
    }
  }

  if (!versionId) {
    return (
      <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontStyle: 'italic' }}>
        Seleccione una versión de trabajo para gestionar dependencias globales.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Globe size={14} color={t.primary} />
        <span style={{ fontWeight: 600, fontSize: 11, color: t.text }}>Dependencias globales</span>
        <DepAyudaButton t={t} onClick={() => setAyudaOpen(true)} />
      </div>

      <p style={{ margin: 0, fontSize: 10, color: t.textMuted, lineHeight: 1.4 }}>
        Secuencia estándar capítulo→capítulo que se aplica a todos los PKs con ambos capítulos programados. Una
        dependencia específica del mismo par en un PK tiene prioridad.
      </p>

      {loading ? (
        <div style={{ color: t.textMuted, fontSize: 10 }}>Cargando…</div>
      ) : deps.length === 0 ? (
        <div style={{ color: t.textMuted, fontSize: 10, fontStyle: 'italic' }}>Sin dependencias globales definidas.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                {['Cap. origen', 'Tipo', 'Lag', 'Cap. destino', ''].map((h) => (
                  <th
                    key={h}
                    style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600, color: t.textMuted, whiteSpace: 'nowrap' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deps.map((dep) => (
                <tr key={dep.id} style={{ borderBottom: `1px solid ${t.border}22` }}>
                  <td style={{ padding: '4px 6px', color: t.text }}>{dep.capitulo_origen}</td>
                  <td style={{ padding: '4px 6px' }}>
                    <TipoBadge tipo={dep.tipo} t={t} />
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'center', color: t.text }}>{dep.lag_dias ?? 0}</td>
                  <td style={{ padding: '4px 6px', color: t.text }}>{dep.capitulo_destino}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                    {editable && (
                      <button
                        type="button"
                        disabled={deletingId === dep.id}
                        onClick={() => handleEliminar(dep.id)}
                        title="Eliminar"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          color: '#ef4444',
                          opacity: deletingId === dep.id ? 0.5 : 1,
                          padding: 2,
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable && capitulos.length > 0 && (
        <div
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: 6,
            padding: 8,
            background: t.bg,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={12} /> Agregar global
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 48px 1fr', gap: 6, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 9, color: t.textMuted, display: 'block', marginBottom: 2 }}>Origen</label>
              <select value={formCapOrigen} onChange={(e) => setFormCapOrigen(e.target.value)} style={inputStyle(t)}>
                {capitulos.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, color: t.textMuted, display: 'block', marginBottom: 2 }}>Tipo</label>
              <select value={formTipo} onChange={(e) => setFormTipo(e.target.value)} style={inputStyle(t)}>
                {TIPOS.map((tp) => (
                  <option key={tp.value} value={tp.value}>
                    {tp.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, color: t.textMuted, display: 'block', marginBottom: 2 }}>Lag</label>
              <input
                type="number"
                value={formLag}
                onChange={(e) => setFormLag(e.target.value)}
                style={inputStyle(t)}
              />
            </div>
            <div>
              <label style={{ fontSize: 9, color: t.textMuted, display: 'block', marginBottom: 2 }}>Destino</label>
              <select value={formCapDest} onChange={(e) => setFormCapDest(e.target.value)} style={inputStyle(t)}>
                {capitulos.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {formError && (
            <div
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'flex-start',
                color: '#b91c1c',
                fontSize: 10,
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 4,
                padding: '6px 8px',
              }}
            >
              <AlertCircle size={13} style={{ flexShrink: 0 }} />
              <span>{formError}</span>
            </div>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleAgregar()}
            style={{
              padding: '5px 10px',
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${t.primary}`,
              background: t.bgCard,
              color: t.primary,
              cursor: saving ? 'wait' : 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            {saving ? 'Guardando…' : 'Agregar dependencia global'}
          </button>
        </div>
      )}

      {!editable && (
        <div style={{ fontSize: 10, color: t.textMuted, fontStyle: 'italic' }}>
          Solo lectura — seleccione un borrador editable para modificar.
        </div>
      )}

      <ProgObraDepAyuda open={ayudaOpen} onClose={() => setAyudaOpen(false)} t={t} />
    </div>
  )
}
