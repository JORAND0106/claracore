import { Fragment, useState } from 'react'
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
  fase = '',
  onCancel,
  onConfirm,
}) {
  const ui = useAlmacenTheme()
  const [aceptaCrear, setAceptaCrear] = useState(false)
  const [abiertos, setAbiertos] = useState({})
  const grupos = vista?.grupos || []
  const vacias = vista?.vacias || []
  const porCrear = Number(vista?.por_crear) || 0
  const sinCambios = Boolean(vista?.sin_cambios)
  const puedeConfirmar = !sinCambios && !resumen && (porCrear === 0 || aceptaCrear)
  const frase = vista?.resumen_accion
    || 'Reúne las líneas con insumo por proveedor y estado. No crea solicitudes nuevas salvo que lo confirme.'
  const completados = Number(vista?.proveedores_completados) || 0

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
        <p data-testid="agrupar-resumen-accion" style={{ margin: '0 0 12px', color: ui.text, fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
          {frase}
          {' '}
          Las solicitudes que ya tienen OC no se mueven.
        </p>
        {completados > 0 && (
          <p data-testid="agrupar-proveedores-completados" style={{ margin: '0 0 12px', color: ui.text, fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
            Se guardó el proveedor en {completados} línea(s) que ya tenían insumo.
            El movimiento de líneas espera su confirmación.
          </p>
        )}
        {vista?.diagnostico_texto && (
          <p data-testid="agrupar-diagnostico" style={{ margin: '0 0 12px', color: ui.textMuted, fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
            {vista.diagnostico_texto}
          </p>
        )}
        {busy && fase && (
          <div data-testid="agrupar-progreso" style={{ margin: '0 0 12px', fontWeight: 700 }}>
            {fase}
          </div>
        )}

        {error && <div style={{ color: '#dc2626', marginBottom: 10 }}>{error}</div>}

        {resumen ? (
          <div data-testid="agrupar-resumen" style={{ fontWeight: 700, marginBottom: 12 }}>
            {resumen}
            {vista?.duracion_ms != null && (
              <div data-testid="agrupar-duracion" style={{ fontWeight: 500, marginTop: 6 }}>
                Tardó {vista.duracion_ms} ms.
              </div>
            )}
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
                  <th style={ui.th}>Destino</th>
                  <th style={{ ...ui.th, textAlign: 'right' }}>Quedarán</th>
                  <th style={{ ...ui.th, textAlign: 'right' }}>Se mueven</th>
                  <th style={ui.th} />
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => {
                  const clave = `${g.proveedor}-${g.estado}-${g.consecutivo || 'nueva'}`
                  const abierto = Boolean(abiertos[clave])
                  const detalle = g.lineas_detalle || []
                  return (
                    <Fragment key={clave}>
                      <tr>
                        <td style={ui.td}>
                          <div style={{ fontWeight: 700 }}>{g.proveedor}</div>
                          <div style={{ color: ui.textMuted, fontSize: 'var(--cc-xs)' }}>
                            {g.crear ? 'Solicitud nueva' : `Solicitud #${g.consecutivo}`}
                            {' · '}
                            {g.estado_label || ESTADO_SOLICITUD_LABEL[g.estado] || g.estado}
                            {verEconomicos && g.total != null ? ` · ${fmtMoney(g.total)}` : ''}
                          </div>
                        </td>
                        <td style={{ ...ui.td, textAlign: 'right' }}>{g.lineas}</td>
                        <td style={{ ...ui.td, textAlign: 'right' }}>{g.se_mueven}</td>
                        <td style={ui.td}>
                          {detalle.length > 0 && (
                            <button
                              type="button"
                              data-testid="agrupar-ver-lineas"
                              style={{ ...ui.btnSecondary, padding: '2px 8px', minHeight: 0 }}
                              onClick={() => setAbiertos((prev) => ({ ...prev, [clave]: !prev[clave] }))}
                            >
                              {abierto ? 'Ocultar líneas' : 'Ver líneas'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {abierto && (
                        <tr>
                          <td style={ui.td} colSpan={4}>
                            {detalle.map((ln) => (
                              <div key={ln.item_id} style={{ fontSize: 'var(--cc-xs)', marginBottom: 4 }}>
                                {ln.numero_linea != null ? `Línea ${ln.numero_linea}` : 'Línea'}
                                {ln.descripcion ? ` · ${ln.descripcion}` : ''}
                                {ln.se_mueve ? ` · se mueve desde #${ln.desde ?? '—'}` : ' · ya está aquí'}
                              </div>
                            ))}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
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
              {busy ? (fase || 'Agrupando…') : 'Agrupar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
