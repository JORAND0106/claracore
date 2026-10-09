import { useState } from 'react'
import { ESTADO_SOLICITUD_LABEL, fmtMoney, useAlmacenTheme } from './almacenShared'

/**
 * Vista previa de Agrupar. No escribe hasta confirmar.
 * Las cifras solo aparecen si el rol ya puede ver valores.
 */
export default function AgruparSolicitudesModal({
  vista,
  verEconomicos = false,
  busy = false,
  error = '',
  resumen = '',
  onCancel,
  onConfirm,
}) {
  const ui = useAlmacenTheme()
  const [aceptaCrear, setAceptaCrear] = useState(false)
  const grupos = vista?.grupos || []
  const vacias = vista?.vacias || []
  const porCrear = Number(vista?.por_crear) || 0
  const sinCambios = Boolean(vista?.sin_cambios)
  const puedeConfirmar = !sinCambios && !resumen && (porCrear === 0 || aceptaCrear)

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="agrupar-vista-previa"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100050,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => { if (!busy) onCancel?.() }}
    >
      <div
        style={{ ...ui.card, maxWidth: 820, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 800, marginBottom: 6 }}>
          Agrupar solicitudes por proveedor
        </div>
        <p style={{ margin: '0 0 12px', color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
          Las líneas sin orden de compra se reúnen por proveedor. Las solicitudes que ya tienen OC
          no se mueven. Las que queden sin líneas se conservan, marcadas como vacías.
        </p>

        {error && <div style={{ color: '#dc2626', marginBottom: 10 }}>{error}</div>}

        {resumen ? (
          <div data-testid="agrupar-resumen" style={{ fontWeight: 700, marginBottom: 12 }}>
            {resumen}
            {vista?.bloqueo_persistido === false && (
              <div style={{ fontWeight: 500, color: '#b45309', marginTop: 8 }}>
                No quedó activo el bloqueo de edición: falta la tabla en la base.
                Otro usuario podría editar mientras se agrupa.
              </div>
            )}
          </div>
        ) : sinCambios ? (
          <div data-testid="agrupar-sin-cambios" style={{ marginBottom: 12 }}>
            Ejecutar de nuevo no cambia nada: las solicitudes ya están agrupadas.
          </div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
              <thead>
                <tr>
                  <th style={ui.th}>Solicitud</th>
                  <th style={ui.th}>Proveedor</th>
                  <th style={ui.th}>Estado</th>
                  <th style={{ ...ui.th, textAlign: 'right' }}>Líneas</th>
                  <th style={{ ...ui.th, textAlign: 'right' }}>Se mueven</th>
                  {verEconomicos && <th style={{ ...ui.th, textAlign: 'right' }}>Total</th>}
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <tr key={`${g.proveedor}-${g.estado}-${g.consecutivo || 'nueva'}`}>
                    <td style={ui.td}>
                      {g.crear ? 'Nueva' : `Solicitud #${g.consecutivo}`}
                    </td>
                    <td style={ui.td}>{g.proveedor}</td>
                    <td style={ui.td}>{g.estado_label || ESTADO_SOLICITUD_LABEL[g.estado] || g.estado}</td>
                    <td style={{ ...ui.td, textAlign: 'right' }}>{g.lineas}</td>
                    <td style={{ ...ui.td, textAlign: 'right' }}>{g.se_mueven}</td>
                    {verEconomicos && (
                      <td style={{ ...ui.td, textAlign: 'right' }} data-testid="agrupar-total">
                        {g.total == null ? '—' : fmtMoney(g.total)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {vacias.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 'var(--cc-sm)' }}>
                Quedarán vacías y se conservan:
                {' '}
                {vacias.map((v) => `#${v.consecutivo}`).join(', ')}
              </div>
            )}

            {Number(vista?.congeladas) > 0 && (
              <div style={{ marginTop: 8, fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                {vista.congeladas} solicitud(es) con OC quedan igual.
              </div>
            )}

            {porCrear > 0 && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14 }}>
                <input
                  type="checkbox"
                  data-testid="agrupar-confirmar-creacion"
                  checked={aceptaCrear}
                  onChange={(e) => setAceptaCrear(e.target.checked)}
                />
                <span>
                  Faltan {porCrear} solicitud(es) para los grupos. Confirmo crear solo esas,
                  sin crear ninguna de más.
                </span>
              </label>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={ui.btnSecondary} disabled={busy} onClick={onCancel}>
            {resumen || sinCambios ? 'Cerrar' : 'Cancelar'}
          </button>
          {!resumen && !sinCambios && (
            <button
              type="button"
              style={ui.btnPrimary}
              data-testid="agrupar-confirmar"
              disabled={busy || !puedeConfirmar}
              onClick={() => onConfirm?.({
                confirmar_creacion: porCrear > 0,
                crear_hasta: porCrear,
              })}
            >
              {busy ? 'Agrupando…' : 'Agrupar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
