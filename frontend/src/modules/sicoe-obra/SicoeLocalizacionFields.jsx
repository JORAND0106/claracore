import { useState } from 'react'
import SicoeFiltroPkMapa from './SicoeFiltroPkMapa'

const inpStyle = (t, err) => ({
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  fontSize: 'var(--cc-sm)',
  background: t.bg,
  color: t.text,
  boxSizing: 'border-box',
  border: `1px solid ${err ? '#EF4444' : t.border}`,
  outline: 'none',
})

/**
 * Bloque de localización PK + costado + abscisas + nodos (reporte único o registro).
 */
export default function SicoeLocalizacionFields({
  t,
  token,
  contratoId,
  value,
  onChange,
  errores = {},
  pkIds = [],
  nodos = [],
  readOnly = false,
  showTitle = true,
}) {
  const [nodoIniSugg, setNodoIniSugg] = useState([])
  const [nodoFinSugg, setNodoFinSugg] = useState([])
  const [nodoIniWarn, setNodoIniWarn] = useState(false)
  const [nodoFinWarn, setNodoFinWarn] = useState(false)

  const patch = (p) => onChange?.({ ...value, ...p })

  const pkRow = value?.pkSeleccionado
  const pkIdStr = pkRow?.id != null ? String(pkRow.id) : (value?.pk_id_id != null ? String(value.pk_id_id) : '')

  if (readOnly) {
    return (
      <div>
        {showTitle && (
          <div style={{ fontSize: 'var(--cc-label)', fontWeight: 800, color: '#F59E0B', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>
            📍 Localización
          </div>
        )}
        <div style={{ padding: '10px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: '10px' }}>
          {pkRow?.pk_id || pkIdStr || '—'}
          {(pkRow?.civ || value?.civ) && (
            <span> · CIV: {pkRow?.civ || value?.civ} · {pkRow?.tramo || value?.tramo || '—'} · {pkRow?.infraestructura || value?.infraestructura || '—'} · {pkRow?.calzada || value?.calzada || '—'}</span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', fontSize: 'var(--cc-sm)' }}>
          <div><span style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', fontWeight: 700 }}>Costado</span><div>{value?.margen || '—'}</div></div>
          <div><span style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', fontWeight: 700 }}>Abs. inicio</span><div>{value?.absInicio ?? '—'}</div></div>
          <div><span style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', fontWeight: 700 }}>Abs. final</span><div>{value?.absFinal ?? '—'}</div></div>
          <div><span style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', fontWeight: 700 }}>Nodos</span><div>{value?.nodoIni || '—'} → {value?.nodoFin || '—'}</div></div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {showTitle && (
        <div style={{ fontSize: 'var(--cc-label)', fontWeight: 800, color: '#F59E0B', letterSpacing: '1px', textTransform: 'uppercase' }}>
          📍 Localización *
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '12px', alignItems: 'start' }}>
        <div>
          <label style={{ fontSize: 'var(--cc-sm)', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>
            PK-ID (polígono) *
          </label>
          <SicoeFiltroPkMapa
            t={t}
            token={token}
            contratoId={contratoId}
            pkList={pkIds}
            pkIdSeleccionado={pkIdStr}
            pkLabel={pkRow?.pk_id || ''}
            onSeleccionar={({ pk_id_id }) => {
              const found = pkIds.find((p) => String(p.id) === String(pk_id_id))
              if (found) patch({ pkSeleccionado: found, pk_id_id: found.id })
            }}
            onLimpiar={() => patch({ pkSeleccionado: null, pk_id_id: null, coordLat: null, coordLng: null })}
          />
          {pkRow && (
            <div style={{ marginTop: '6px', padding: '8px 12px', background: t.bg, borderRadius: '6px', fontSize: 'var(--cc-label)', color: t.textMuted }}>
              CIV: {pkRow.civ || '—'} · {pkRow.tramo || '—'} · {pkRow.infraestructura || '—'} · {pkRow.calzada || '—'}
            </div>
          )}
          {errores.pk && <span style={{ color: '#EF4444', fontSize: 'var(--cc-label)' }}>{errores.pk}</span>}
        </div>

        <div>
          <label style={{ fontSize: 'var(--cc-sm)', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>
            Costado *
          </label>
          <select
            value={String(value?.margen || '').startsWith('Otro:') ? 'Otro' : (value?.margen || '')}
            onChange={(e) => patch({ margen: e.target.value === 'Otro' ? 'Otro: ' : e.target.value })}
            style={inpStyle(t, errores.margen)}
          >
            <option value="">-- Seleccionar --</option>
            {['Izquierda', 'Central', 'Derecha', 'Única', 'Otro'].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {String(value?.margen || '').startsWith('Otro:') && (
            <input
              value={String(value.margen).replace('Otro: ', '')}
              onChange={(e) => patch({ margen: `Otro: ${e.target.value}` })}
              placeholder="Especificar..."
              style={{ ...inpStyle(t, false), marginTop: '6px' }}
            />
          )}
          {errores.margen && <span style={{ color: '#EF4444', fontSize: 'var(--cc-label)' }}>{errores.margen}</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
        {[
          ['absInicio', 'Abs. inicial', 'absInicio'],
          ['absFinal', 'Abs. final', 'absFinal'],
        ].map(([field, label, errKey]) => (
          <div key={field}>
            <label style={{ fontSize: 'var(--cc-sm)', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>{label} *</label>
            <input
              type="number"
              step="0.01"
              value={value?.[field] ?? ''}
              onChange={(e) => patch({ [field]: e.target.value })}
              placeholder="0.00"
              style={inpStyle(t, errores[errKey])}
            />
            {errores[errKey] && <span style={{ color: '#EF4444', fontSize: 'var(--cc-label)' }}>{errores[errKey]}</span>}
          </div>
        ))}

        {[
          ['nodoIni', 'Nodo inicial', 'nodoIni', nodoIniSugg, setNodoIniSugg, nodoIniWarn, setNodoIniWarn],
          ['nodoFin', 'Nodo final', 'nodoFin', nodoFinSugg, setNodoFinSugg, nodoFinWarn, setNodoFinWarn],
        ].map(([field, label, errKey, sugg, setSugg, warn, setWarn]) => (
          <div key={field} style={{ position: 'relative' }}>
            <label style={{ fontSize: 'var(--cc-sm)', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>{label} *</label>
            <input
              value={value?.[field] || ''}
              onChange={(e) => {
                patch({ [field]: e.target.value })
                setWarn(false)
                if (e.target.value.length > 1) {
                  setSugg(nodos.filter((n) => n.toLowerCase().includes(e.target.value.toLowerCase())).slice(0, 8))
                } else setSugg([])
              }}
              onBlur={() => {
                if (value?.[field] && !nodos.includes(value[field])) setWarn(true)
                setTimeout(() => setSugg([]), 200)
              }}
              placeholder={`${label}...`}
              style={inpStyle(t, errores[errKey])}
            />
            {sugg.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: '6px', zIndex: 10 }}>
                {sugg.map((n) => (
                  <div
                    key={n}
                    onMouseDown={() => { patch({ [field]: n }); setSugg([]); setWarn(false) }}
                    style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 'var(--cc-sm)', color: t.text }}
                  >
                    {n}
                  </div>
                ))}
              </div>
            )}
            {warn && <span style={{ color: '#F59E0B', fontSize: 'var(--cc-label)' }}>⚠️ No existe en presupuesto</span>}
            {errores[errKey] && <span style={{ color: '#EF4444', fontSize: 'var(--cc-label)' }}>{errores[errKey]}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
