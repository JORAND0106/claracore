/**
 * Hoja para descargar PNG del día: colaboradores (tramo×empresa) + eventos.
 * Debe permanecer montada; la posición off-screen se corrige en la captura
 * (left:-9999 produce PNG en blanco con html-to-image).
 */
import { forwardRef, useMemo } from 'react'
import { formatoCeldaCantidad } from './bitacoraReportePersonal'
import { buildBitacoraPngPayload } from './bitacoraReporteDiarioPng'

function formatoCantidad(n) {
  return formatoCeldaCantidad(n)
}

const BitacoraReporteDiarioPngCapture = forwardRef(function BitacoraReporteDiarioPngCapture(
  {
    fecha,
    asistencia = [],
    eventos = [],
    rrhhCatalogo = [],
    contratoMeta = {},
    theme = null,
  },
  ref,
) {
  const t = theme || {}
  const border = t.border || '#bae6fd'
  const text = t.text || '#0f2942'
  const muted = t.textMuted || '#4a7fa5'
  const headerBg = t.inputBg || '#eef7fb'
  const primary = t.primary || '#1F4E70'
  const surface = '#ffffff'

  const payload = useMemo(
    () => buildBitacoraPngPayload({
      asistencia,
      eventos,
      rrhhCatalogo,
      fecha,
      contratoMeta,
    }),
    [asistencia, eventos, rrhhCatalogo, fecha, contratoMeta],
  )

  const { personal, eventosRows, fechaFmt, numero, contratista } = payload

  return (
    <div
      ref={ref}
      data-bitacora-png-capture="1"
      aria-hidden
      style={{
        /* Parqueo inicial: fuera de vista. La captura lo mueve a (0,0) temporalmente. */
        position: 'fixed',
        left: '-10000px',
        top: '0',
        width: 920,
        background: surface,
        color: text,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        fontSize: 12,
        padding: '22px 26px',
        boxSizing: 'border-box',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4, color: primary }}>
        Resumen de bitácora
      </div>
      <div style={{ fontSize: 11, color: muted, marginBottom: 16, lineHeight: 1.4 }}>
        {fechaFmt}
        {numero ? ` · Contrato ${numero}` : ''}
        {contratista ? ` · ${contratista}` : ''}
      </div>

      {/* —— 1. Colaboradores por tramo × empresa —— */}
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, color: text }}>
        Colaboradores (por tramo y empresa)
      </div>
      {personal?.hasData ? (
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 11,
          marginBottom: 18,
          background: surface,
        }}
        >
          <thead>
            <tr>
              <th style={{
                textAlign: 'left',
                padding: '8px 10px',
                border: `1.5px solid ${border}`,
                background: headerBg,
                color: muted,
                fontWeight: 800,
              }}
              >
                Tramo
              </th>
              {(personal.empresas || []).map((emp) => (
                <th
                  key={emp.key}
                  style={{
                    textAlign: 'center',
                    padding: '8px 8px',
                    border: `1.5px solid ${border}`,
                    background: headerBg,
                    color: text,
                    fontWeight: 800,
                    minWidth: 64,
                  }}
                >
                  {emp.nombre}
                </th>
              ))}
              <th style={{
                textAlign: 'center',
                padding: '8px 10px',
                border: `1.5px solid ${border}`,
                background: headerBg,
                color: text,
                fontWeight: 800,
              }}
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {(personal.tramos || []).map((tr, i) => (
              <tr key={tr.key} style={{ background: i % 2 ? '#f8fafc' : surface }}>
                <td style={{
                  padding: '7px 10px',
                  border: `1px solid ${border}`,
                  fontWeight: 700,
                  color: text,
                  whiteSpace: 'nowrap',
                }}
                >
                  {tr.nombre}
                </td>
                {(personal.empresas || []).map((emp) => {
                  const n = personal.cells?.[tr.key]?.[emp.key] || 0
                  const empty = !(Number(n) > 0)
                  return (
                    <td
                      key={emp.key}
                      style={{
                        padding: '7px 8px',
                        border: `1px solid ${border}`,
                        textAlign: 'center',
                        fontWeight: empty ? 500 : 700,
                        color: empty ? muted : text,
                      }}
                    >
                      {formatoCantidad(n)}
                    </td>
                  )
                })}
                <td style={{
                  padding: '7px 10px',
                  border: `1px solid ${border}`,
                  textAlign: 'center',
                  fontWeight: 800,
                  background: headerBg,
                  color: text,
                }}
                >
                  {formatoCantidad(personal.rowTotals?.[tr.key])}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{
                padding: '8px 10px',
                border: `1.5px solid ${border}`,
                fontWeight: 800,
                background: headerBg,
                color: text,
              }}
              >
                Total
              </td>
              {(personal.empresas || []).map((emp) => (
                <td
                  key={emp.key}
                  style={{
                    padding: '8px 8px',
                    border: `1.5px solid ${border}`,
                    textAlign: 'center',
                    fontWeight: 800,
                    background: headerBg,
                    color: text,
                  }}
                >
                  {formatoCantidad(personal.colTotals?.[emp.key])}
                </td>
              ))}
              <td style={{
                padding: '8px 10px',
                border: `1.5px solid ${border}`,
                textAlign: 'center',
                fontWeight: 800,
                background: headerBg,
                color: primary,
              }}
              >
                {formatoCantidad(personal.grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div style={{
          marginBottom: 18,
          padding: '10px 12px',
          border: `1px dashed ${border}`,
          color: muted,
          fontSize: 12,
          background: surface,
        }}
        >
          Sin colaboradores registrados
        </div>
      )}

      {/* —— 2. Eventos del día —— */}
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, color: text }}>
        Eventos del día
      </div>
      {eventosRows.length ? (
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 11,
          background: surface,
        }}
        >
          <thead>
            <tr>
              {['Tipo', 'Dirigido a', 'Resumen'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    border: `1.5px solid ${border}`,
                    background: headerBg,
                    color: muted,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {eventosRows.map((r, i) => (
              <tr key={`${r.tipo}-${i}`} style={{ background: i % 2 ? '#f8fafc' : surface }}>
                <td style={{
                  padding: '7px 10px',
                  border: `1px solid ${border}`,
                  fontWeight: 700,
                  color: text,
                  verticalAlign: 'top',
                  whiteSpace: 'nowrap',
                }}
                >
                  {r.tipo}
                </td>
                <td style={{
                  padding: '7px 10px',
                  border: `1px solid ${border}`,
                  color: text,
                  verticalAlign: 'top',
                }}
                >
                  {r.dirigido_a}
                </td>
                <td style={{
                  padding: '7px 10px',
                  border: `1px solid ${border}`,
                  color: text,
                  verticalAlign: 'top',
                  wordBreak: 'break-word',
                }}
                >
                  {r.resumen}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{
          padding: '10px 12px',
          border: `1px dashed ${border}`,
          color: muted,
          fontSize: 12,
          background: surface,
        }}
        >
          Sin eventos registrados
        </div>
      )}
    </div>
  )
})

export default BitacoraReporteDiarioPngCapture
