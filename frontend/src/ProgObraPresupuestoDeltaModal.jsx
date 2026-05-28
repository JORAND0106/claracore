import { fmtCOP, fmtCant } from './progObraFormat'

function fmtDeltaMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const v = Math.round(Number(n))
  if (v === 0) return fmtCOP(0)
  const sign = v > 0 ? '+' : ''
  return `${sign}${fmtCOP(v)}`
}

function fmtDeltaPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

function renderCambioLinea(c) {
  const label = `${c.pk_id} · ${c.item}${c.descripcion ? ` ${c.descripcion}` : ''}`
  if (c.tipo === 'nuevo') {
    return (
      <div key={`${c.pk_id}-${c.capitulo}-${c.item}-n`} style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--cc-sm)' }}>{label}</div>
        <div style={{ fontSize: 'var(--cc-caption)', color: '#b45309', marginTop: 4 }}>
          Ítem nuevo — sin fechas programadas aún
        </div>
      </div>
    )
  }
  if (c.tipo === 'baja') {
    return (
      <div key={`${c.pk_id}-${c.capitulo}-${c.item}-b`} style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--cc-sm)' }}>{label}</div>
        <div style={{ fontSize: 'var(--cc-caption)', color: '#dc2626', marginTop: 4 }}>
          Dado de baja — ya no existe en presupuesto
        </div>
        {c.impacto_costo ? (
          <div style={{ fontSize: 'var(--cc-caption)', color: '#64748b', marginTop: 2 }}>
            Impacto en costo: {fmtDeltaMoney(c.impacto_costo)}
          </div>
        ) : null}
      </div>
    )
  }

  const und = c.unidad || '?'
  const lines = []
  if (c.tipo === 'cantidad' || c.tipo === 'cantidad_y_costo') {
    const ant = c.anterior?.cantidad
    const act = c.actual?.cantidad
    const d = c.delta_cantidad
    const dSign = d > 0 ? '+' : ''
    lines.push(
      <div key="cant" style={{ fontSize: 'var(--cc-caption)', color: '#475569', marginTop: 4 }}>
        Cantidad: {fmtCant(ant)} → {fmtCant(act)} {und}
        {d != null ? ` (${dSign}${fmtCant(d)})` : ''}
      </div>,
    )
  }
  if (c.tipo === 'costo_unitario' || c.tipo === 'cantidad_y_costo') {
    lines.push(
      <div key="cu" style={{ fontSize: 'var(--cc-caption)', color: '#475569', marginTop: 4 }}>
        Costo unitario: {fmtCOP(c.anterior?.costo_unitario)} → {fmtCOP(c.actual?.costo_unitario)}
      </div>,
    )
  }
  if (c.impacto_costo) {
    lines.push(
      <div key="imp" style={{ fontSize: 'var(--cc-caption)', color: '#64748b', marginTop: 2 }}>
        Impacto en costo: {fmtDeltaMoney(c.impacto_costo)}
      </div>,
    )
  }

  return (
    <div key={`${c.pk_id}-${c.capitulo}-${c.item}`} style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 'var(--cc-sm)' }}>{label}</div>
      {lines}
    </div>
  )
}

/**
 * Modal informativo: delta presupuesto vs snapshot al crear reprogramación.
 */
export default function ProgObraPresupuestoDeltaModal({ open, delta, onClose, t, btnStyle, panelBusy }) {
  if (!open || !delta) return null

  const sinCambios = delta.sin_cambios && !delta.snapshot_ausente
  const titulo = sinCambios ? 'Presupuesto sin cambios' : 'Cambios detectados en el presupuesto'

  return (
    <div
      style={{
        background: t.bgCard,
        borderRadius: 12,
        border: `1px solid ${t.border}`,
        padding: 20,
        maxWidth: 560,
        width: '100%',
        maxHeight: '85vh',
        overflow: 'auto',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontWeight: 700, fontSize: 'var(--cc-md)', color: '#b45309', marginBottom: 8 }}>⚠ {titulo}</div>

      {delta.snapshot_ausente && delta.alerta ? (
        <p style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, margin: '0 0 12px', lineHeight: 1.45 }}>
          {delta.alerta}
        </p>
      ) : null}

      {sinCambios ? (
        <p style={{ fontSize: 'var(--cc-sm)', color: t.text, margin: '0 0 16px' }}>
          Sin cambios vs presupuesto anterior.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, margin: '0 0 12px', lineHeight: 1.45 }}>
            Los siguientes cambios actualizarán los valores del cronograma pero <strong>NO</strong> modificarán las
            fechas:
          </p>
          <div
            style={{
              borderTop: `1px solid ${t.border}`,
              borderBottom: `1px solid ${t.border}`,
              padding: '12px 0',
              marginBottom: 12,
            }}
          >
            {(delta.cambios || []).map(renderCambioLinea)}
          </div>
          {delta.total_cambios > 0 ? (
            <p style={{ fontSize: 'var(--cc-sm)', color: t.text, margin: '0 0 12px' }}>
              {delta.total_cambios} cambio{delta.total_cambios === 1 ? '' : 's'} detectado
              {delta.total_cambios === 1 ? '' : 's'}. Ajusta la programación antes de enviar a validación.
            </p>
          ) : null}
        </>
      )}

      {(delta.costo_programacion_anterior != null || delta.costo_programacion_actualizado != null) &&
      (delta.costo_programacion_anterior > 0 || delta.costo_programacion_actualizado > 0) ? (
        <div
          style={{
            background: t.bgMuted || '#f8fafc',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            fontSize: 'var(--cc-sm)',
          }}
        >
          <div>
            Programación anterior: <strong>{fmtCOP(delta.costo_programacion_anterior)}</strong>
          </div>
          <div style={{ marginTop: 4 }}>
            Programación actualizada: <strong>{fmtCOP(delta.costo_programacion_actualizado)}</strong>
          </div>
          <div style={{ marginTop: 4, color: delta.variacion >= 0 ? '#059669' : '#dc2626' }}>
            Variación: {fmtDeltaMoney(delta.variacion)} ({fmtDeltaPct(delta.pct_variacion)})
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" style={btnStyle(true, panelBusy)} disabled={panelBusy} onClick={onClose}>
          Entendido, continuar
        </button>
      </div>
    </div>
  )
}
