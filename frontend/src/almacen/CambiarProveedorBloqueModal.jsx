import { useEffect, useState } from 'react'
import { fmtCant, fmtMoneySolicitud as fmtMoney, useAlmacenTheme } from './almacenShared'

/**
 * Popup: una fila por cotización del insumo. Solo un insumo por operación.
 */
export default function CambiarProveedorBloqueModal({
  vista,
  busy = false,
  error = '',
  verEconomicos = false,
  onCancel,
  onAsignar,
}) {
  const ui = useAlmacenTheme()
  const ofertas = vista?.ofertas || []
  const [selKey, setSelKey] = useState(null)

  useEffect(() => {
    const actual = ofertas.find((o) => o.es_actual) || ofertas.find((o) => o.es_ganadora) || ofertas[0]
    if (!actual) {
      setSelKey(null)
      return
    }
    setSelKey(`${actual.proveedor_id || ''}|${actual.numero || ''}|${actual.proveedor_nombre || ''}`)
  }, [vista?.insumo_id, ofertas.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const elegida = ofertas.find(
    (o) => `${o.proveedor_id || ''}|${o.numero || ''}|${o.proveedor_nombre || ''}` === selKey,
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="cambiar-proveedor-bloque"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100070,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => { if (!busy) onCancel?.() }}
    >
      <div
        style={{ ...ui.card, maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 800, marginBottom: 6 }}>
          Cambiar proveedor
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 'var(--cc-sm)', color: ui.textMuted, lineHeight: 1.45 }}>
          Se aplica a las {vista?.lineas_editables ?? '—'} línea(s) editables de este insumo
          {vista?.cantidad_total != null ? ` (cantidad total ${fmtCant(vista.cantidad_total)})` : ''}.
          {vista?.lineas_en_oc > 0
            ? ` ${vista.lineas_en_oc} línea(s) ya tienen OC y no se modificarán.`
            : ''}
        </p>
        {vista?.proveedor_actual_nombre && (
          <div style={{ marginBottom: 10, fontSize: 'var(--cc-sm)' }}>
            Proveedor actual: <strong>{vista.proveedor_actual_nombre}</strong>
          </div>
        )}
        {error && (
          <div data-testid="cambiar-proveedor-bloque-error" style={{ color: '#b91c1c', marginBottom: 10 }}>
            {error}
          </div>
        )}
        <div style={{ ...ui.sheetWrap, marginBottom: 14 }} className="cc-almacen-table-scroll">
          <table style={{ ...ui.sheetTable, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...ui.th, width: 36 }} />
                <th style={ui.th}>Proveedor</th>
                {verEconomicos && <th style={{ ...ui.th, textAlign: 'right' }}>Valor unitario</th>}
                {verEconomicos && <th style={{ ...ui.th, textAlign: 'right' }}>Costo total</th>}
              </tr>
            </thead>
            <tbody>
              {ofertas.length === 0 ? (
                <tr>
                  <td colSpan={verEconomicos ? 4 : 2} style={{ ...ui.td, color: ui.textMuted }}>
                    Este insumo no tiene cotizaciones.
                  </td>
                </tr>
              ) : ofertas.map((o) => {
                const key = `${o.proveedor_id || ''}|${o.numero || ''}|${o.proveedor_nombre || ''}`
                return (
                  <tr
                    key={key}
                    data-testid="cambiar-proveedor-oferta"
                    data-actual={o.es_actual ? 'true' : undefined}
                    onClick={() => setSelKey(key)}
                    style={{ cursor: 'pointer', background: selKey === key ? ui.accentSoft : 'transparent' }}
                  >
                    <td style={ui.td}>
                      <input
                        type="radio"
                        name="cambiar-proveedor-sel"
                        checked={selKey === key}
                        onChange={() => setSelKey(key)}
                        aria-label={o.proveedor_nombre || 'Proveedor'}
                      />
                    </td>
                    <td style={ui.td}>
                      <div style={{ fontWeight: 600 }}>
                        {o.proveedor_nombre || '—'}
                        {o.es_actual ? ' · actual' : ''}
                        {o.es_ganadora && !o.es_actual ? ' · ganadora' : ''}
                      </div>
                      {o.numero ? (
                        <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Cot. {o.numero}</div>
                      ) : null}
                    </td>
                    {verEconomicos && (
                      <td style={{ ...ui.td, textAlign: 'right' }}>
                        {o.valor_unitario == null ? '—' : fmtMoney(o.valor_unitario)}
                      </td>
                    )}
                    {verEconomicos && (
                      <td style={{ ...ui.td, textAlign: 'right' }}>
                        {o.costo_total == null ? '—' : fmtMoney(o.costo_total)}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={ui.btnSecondary} disabled={busy} onClick={() => onCancel?.()}>
            Cancelar
          </button>
          <button
            type="button"
            data-testid="cambiar-proveedor-bloque-asignar"
            style={ui.btnPrimary}
            disabled={busy || !elegida}
            onClick={() => onAsignar?.(elegida)}
          >
            {busy ? 'Asignando…' : 'Asignar proveedor'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Confirmación / resultado de Deshacer el último cambio de proveedor en bloque. */
export function DeshacerProveedorBloqueModal({
  vista,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}) {
  const ui = useAlmacenTheme()
  const puede = Boolean(vista?.puede)

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="deshacer-proveedor-bloque"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100070,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => { if (!busy) onCancel?.() }}
    >
      <div
        style={{ ...ui.card, maxWidth: 560, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 800, marginBottom: 6 }}>
          Deshacer cambio de proveedor
        </div>
        <p data-testid="deshacer-proveedor-resumen" style={{ margin: '0 0 12px', fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
          {vista?.resumen || 'Revisando el último cambio…'}
        </p>
        {error && <div style={{ color: '#b91c1c', marginBottom: 10 }}>{error}</div>}
        {(vista?.bloqueos || []).length > 0 && (
          <ul data-testid="deshacer-proveedor-bloqueos" style={{ margin: '0 0 12px', paddingLeft: 18, color: '#b45309' }}>
            {vista.bloqueos.map((texto) => (
              <li key={texto} style={{ marginBottom: 6 }}>{texto}</li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={ui.btnSecondary} disabled={busy} onClick={() => onCancel?.()}>
            {puede ? 'Cancelar' : 'Cerrar'}
          </button>
          {puede && (
            <button
              type="button"
              data-testid="deshacer-proveedor-confirmar"
              style={ui.btnPrimary}
              disabled={busy}
              onClick={() => onConfirm?.()}
            >
              {busy ? 'Revirtiendo…' : 'Confirmar deshacer'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
