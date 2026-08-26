/**
 * Popup de edición de un punto de armada (estación / visado / HI).
 */
import { useEffect, useState } from 'react'
import { fmtNum } from '../../utils/topografia_angular'

export default function PoligonalArmadaEditModal({
  theme,
  armada,
  puntos = [],
  estacionesDisponibles = [],
  visadosDisponibles = [],
  canDelete = false,
  busy = false,
  onSave,
  onDelete,
  onClose,
}) {
  const t = theme || {}
  const [estacion, setEstacion] = useState('')
  const [visado, setVisado] = useState('')
  const [hi, setHi] = useState('')

  useEffect(() => {
    if (!armada) return
    setEstacion(armada.estacion_nombre || '')
    setVisado(armada.visado_nombre || '')
    setHi(armada.altura_instrumento == null ? '' : String(armada.altura_instrumento))
  }, [armada])

  if (!armada) return null

  const inp = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${t.border || '#CBD5E1'}`,
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 'var(--cc-sm)',
    fontFamily: 'inherit',
    color: t.text || '#0F172A',
    background: '#fff',
  }

  const label = {
    display: 'block',
    fontSize: 'var(--cc-xs)',
    fontWeight: 700,
    color: t.textMuted || '#64748B',
    marginBottom: 4,
  }

  const handleSave = () => {
    onSave?.({
      estacion_nombre: estacion.trim(),
      visado_nombre: visado.trim(),
      altura_instrumento: hi === '' ? null : Number(hi),
    })
  }

  const estOpts = estacionesDisponibles.length
    ? estacionesDisponibles
    : estacion
      ? [{ nombre: estacion }]
      : []
  const visOpts = visadosDisponibles.length
    ? visadosDisponibles
    : visado
      ? [{ nombre: visado }]
      : []

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100050,
        background: t.overlay || 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={busy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topo-armada-edit-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflow: 'auto',
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border || '#E2E8F0'}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            background: '#E6F4F5',
            borderBottom: '1px solid #BCE3E6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div id="topo-armada-edit-title" style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: '#0E7C86' }}>
            Editar armada #{armada.orden}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#64748B' }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={label} htmlFor="arm-est">Estación</label>
            <select id="arm-est" value={estacion} onChange={(e) => setEstacion(e.target.value)} style={inp} disabled={busy}>
              <option value="">— Seleccione —</option>
              {estOpts.map((p) => (
                <option key={p.nombre || p} value={p.nombre || p}>{p.nombre || p}</option>
              ))}
              {estacion && !estOpts.some((p) => (p.nombre || p) === estacion) && (
                <option value={estacion}>{estacion}</option>
              )}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="arm-vis">Visado (atrás)</label>
            <select id="arm-vis" value={visado} onChange={(e) => setVisado(e.target.value)} style={inp} disabled={busy}>
              <option value="">— Seleccione —</option>
              {visOpts.map((p) => (
                <option key={p.nombre || p} value={p.nombre || p}>{p.nombre || p}</option>
              ))}
              {visado && !visOpts.some((p) => (p.nombre || p) === visado) && (
                <option value={visado}>{visado}</option>
              )}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="arm-hi">HI — altura del instrumento (m)</label>
            <input
              id="arm-hi"
              type="number"
              step="0.001"
              value={hi}
              onChange={(e) => setHi(e.target.value)}
              style={inp}
              placeholder="1.500"
              disabled={busy}
            />
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: t.bgMuted || '#F8FAFC',
              border: `1px solid ${t.border || '#E2E8F0'}`,
              fontSize: 'var(--cc-xs)',
              color: t.textMuted || '#64748B',
            }}
          >
            <div><strong style={{ color: t.text }}>Azimut base:</strong> {armada.base_azimut_texto ?? '—'} (calculado)</div>
            <div style={{ marginTop: 4 }}>
              <strong style={{ color: t.text }}>Puntos asociados ({puntos.length}):</strong>{' '}
              {puntos.length
                ? puntos.map((p) => p.nombre_punto || p.nombre).filter(Boolean).join(', ')
                : 'ninguno'}
            </div>
            {armada.estacion_coords?.norte != null && (
              <div style={{ marginTop: 4 }}>
                Est. N {fmtNum(armada.estacion_coords.norte, 3)} E {fmtNum(armada.estacion_coords.este, 3)}
                {armada.estacion_coords.cota != null ? ` Z ${fmtNum(armada.estacion_coords.cota, 3)}` : ''}
              </div>
            )}
          </div>
        </div>

        <div
          className="cc-topo-actions-bar"
          style={{
            padding: '4px 18px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          {canDelete ? (
            <button
              type="button"
              className="cc-topo-touch-btn"
              onClick={onDelete}
              disabled={busy}
              style={{
                background: '#FEE2E2',
                color: '#DC2626',
                border: '1px solid #FECACA',
                borderRadius: 8,
                padding: '9px 16px',
                fontSize: 'var(--cc-sm)',
                fontWeight: 700,
                cursor: busy ? 'default' : 'pointer',
                minHeight: 44,
              }}
            >
              Eliminar armada
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button
              type="button"
              className="cc-topo-touch-btn"
              onClick={onClose}
              disabled={busy}
              style={{
                background: '#fff',
                color: t.text || '#334155',
                border: `1px solid ${t.border || '#CBD5E1'}`,
                borderRadius: 8,
                padding: '9px 18px',
                fontSize: 'var(--cc-sm)',
                fontWeight: 700,
                cursor: busy ? 'default' : 'pointer',
                minHeight: 44,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="cc-topo-touch-btn"
              onClick={handleSave}
              disabled={busy || !estacion.trim() || !visado.trim()}
              style={{
                background: '#0E7C86',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '9px 18px',
                fontSize: 'var(--cc-sm)',
                fontWeight: 700,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy || !estacion.trim() || !visado.trim() ? 0.7 : 1,
                minHeight: 44,
              }}
            >
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
