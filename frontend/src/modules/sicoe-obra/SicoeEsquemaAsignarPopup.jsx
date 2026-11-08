/**
 * Tras guardar el PNG: elegir a qué registros del reporte se asigna el esquema.
 * Ninguna casilla marcada al crear; al menos uno. Sellados se pueden marcar/desmarcar
 * (solo cambia la asignación del esquema; no toca cantidades).
 */
import { useState } from 'react'

function fmtMedidas(reg) {
  const L = reg?.longitud
  const A = reg?.ancho
  const E = reg?.espesor
  const parts = []
  if (L != null && L !== '') parts.push(`L ${L}`)
  if (A != null && A !== '') parts.push(`A ${A}`)
  if (E != null && E !== '') parts.push(`E ${E}`)
  return parts.length ? parts.join(' · ') : '—'
}

export default function SicoeEsquemaAsignarPopup({
  t,
  registros = [],
  isSellado = () => false,
  initialIds = [],
  titulo = 'Asignar esquema a registros',
  onConfirm,
  onCancel,
  busy = false,
  /** Error del host (asignar falló): se muestra delante, completo, sin texto técnico. */
  hostError = '',
}) {
  const [selected, setSelected] = useState(() => new Set((initialIds || []).map(String)))
  const [err, setErr] = useState('')

  const toggle = (id) => {
    if (busy) return
    const k = String(id)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const confirmar = () => {
    if (selected.size < 1) {
      setErr('Seleccione al menos un registro')
      return
    }
    setErr('')
    // Pasar ids numéricos cuando el registro los tenga numéricos (evita mismatch).
    const ids = [...selected].map((k) => {
      const reg = (registros || []).find((r) => String(r.id) === String(k))
      return reg ? reg.id : k
    })
    onConfirm?.(ids)
  }

  const visibleErr = err || hostError || ''

  const ui = {
    text: t?.text || '#0f172a',
    muted: t?.textMuted || '#64748b',
    border: t?.border || '#e2e8f0',
    primary: t?.primary || '#0f766e',
    bg: t?.bgCard || '#fff',
    overlay: t?.overlay || 'rgba(15,23,42,0.45)',
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="sicoe-esquema-asignar"
      style={{
        position: 'fixed', inset: 0, zIndex: 14000,
        background: ui.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          width: 'min(640px, 96vw)',
          maxHeight: '86vh',
          overflow: 'auto',
          background: ui.bg,
          border: `1px solid ${ui.border}`,
          borderRadius: 12,
          boxShadow: '0 16px 40px rgba(15,23,42,0.22)',
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16, color: ui.text, marginBottom: 12 }}>
          {titulo}
        </div>
        <div style={{
          border: `1px solid ${ui.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 12,
        }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                <th style={th}> </th>
                <th style={th}>Reg.</th>
                <th style={th}>Ítem</th>
                <th style={th}>Medidas</th>
                <th style={th}>Cant Total</th>
              </tr>
            </thead>
            <tbody>
              {(registros || []).map((reg) => {
                const sellado = !!isSellado(reg)
                const checked = selected.has(String(reg.id))
                return (
                  <tr key={reg.id} style={{ borderTop: `1px solid ${ui.border}` }}>
                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => toggle(reg.id)}
                        aria-label={`Asignar al registro ${reg.numero_registro}`}
                      />
                    </td>
                    <td style={td}>
                      #{reg.numero_registro}
                      {sellado ? (
                        <span
                          style={{ marginLeft: 6, color: '#0f766e', fontWeight: 700 }}
                          title="Registro sellado: se puede asignar o quitar el esquema; las cantidades no cambian"
                        >
                          Sellado
                        </span>
                      ) : null}
                    </td>
                    <td style={td}>{reg.item || reg.codigo_item || '—'}</td>
                    <td style={td}>{fmtMedidas(reg)}</td>
                    <td style={td}>{reg.cantidad_total ?? reg.cant_total ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {visibleErr ? (
          <div
            role="alert"
            data-testid="sicoe-esquema-asignar-error"
            style={{
              color: '#991b1b',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 10,
              position: 'relative',
              zIndex: 2,
            }}
          >
            {visibleErr}
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" disabled={busy} onClick={onCancel} style={btnGhost(ui)}>
            Cancelar
          </button>
          <button type="button" disabled={busy} onClick={confirmar} style={btnPrimary(ui)} data-testid="sicoe-esquema-asignar-ok">
            {busy ? 'Guardando…' : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const th = { padding: '8px 10px', fontWeight: 700, color: '#334155', fontSize: 11 }
const td = { padding: '8px 10px', color: '#0f172a', verticalAlign: 'middle' }

function btnGhost(ui) {
  return {
    padding: '8px 12px', borderRadius: 8, border: `1px solid ${ui.border}`,
    background: 'transparent', color: ui.text, fontWeight: 700, cursor: 'pointer',
  }
}
function btnPrimary(ui) {
  return {
    padding: '8px 12px', borderRadius: 8, border: 'none',
    background: ui.primary, color: '#fff', fontWeight: 700, cursor: 'pointer',
  }
}
