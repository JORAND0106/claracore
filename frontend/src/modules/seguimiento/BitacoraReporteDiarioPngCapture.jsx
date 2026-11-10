/**
 * Hoja compacta para exportar PNG del reporte diario (html-to-image).
 */
import { forwardRef, useMemo } from 'react'
import {
  calcularHorasExtra,
  formatoHorasDecimal,
  normalizeHorario,
} from './bitacoraHorario'
import { formatearFechaReportePersonal } from './bitacoraReportePersonal'

function justificacionFila(row, extra) {
  if (!(extra > 0)) return '—'
  const txt = String(
    row?.justificacion_horas_extra
      || row?.justificacion_extra
      || row?.justificacion
      || row?.observacion
      || '',
  ).trim()
  return txt || '—'
}

const BitacoraReporteDiarioPngCapture = forwardRef(function BitacoraReporteDiarioPngCapture(
  {
    fecha,
    asistencia = [],
    usos = [],
    contratoMeta = {},
    horario = null,
    firmas = null,
  },
  ref,
) {
  const horarioN = useMemo(() => normalizeHorario(horario), [horario])
  const fechaFmt = formatearFechaReportePersonal(fecha)
  const filas = useMemo(() => (Array.isArray(asistencia) ? asistencia : [])
    .filter((r) => String(r?.nombre || '').trim())
    .map((r) => {
      const ini = String(r.hora_ingreso || '').slice(0, 5)
      const fin = String(r.hora_salida || '').slice(0, 5)
      const extra = calcularHorasExtra({
        hora_ingreso: ini,
        hora_salida: fin,
        horario: horarioN,
        fechaISO: fecha,
      })
      return {
        nombre: String(r.nombre || '').trim(),
        cargo: String(r.cargo || '—').trim() || '—',
        empresa: String(r.subcontratista_nombre || '—').trim() || '—',
        entrada: ini || '—',
        salida: fin || '—',
        extra: formatoHorasDecimal(extra),
        justif: justificacionFila(r, extra),
      }
    }), [asistencia, horarioN, fecha])

  const totalExtra = useMemo(() => filas.reduce((acc, r) => {
    const v = Number(String(r.extra).replace('—', '0'))
    return acc + (Number.isFinite(v) ? v : 0)
  }, 0), [filas])

  const maqCount = (Array.isArray(usos) ? usos : []).filter(
    (u) => String(u?.equipo_nombre || '').trim(),
  ).length

  const numero = String(contratoMeta?.numero || '').trim()
  const contratista = String(contratoMeta?.contratista || '').trim()

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: -9999,
        top: 0,
        width: 920,
        background: '#fff',
        color: '#0f2942',
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontSize: 12,
        padding: '20px 24px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
        Reporte diario — Bitácora de obra
      </div>
      <div style={{ fontSize: 11, color: '#4a7fa5', marginBottom: 12 }}>
        {fechaFmt}
        {numero ? ` · Contrato ${numero}` : ''}
        {contratista ? ` · ${contratista}` : ''}
      </div>

      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Personal</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#eef7fb' }}>
            {['Nombre', 'Cargo', 'Empresa', 'Entrada', 'Salida', 'Hrs extra', 'Justificación'].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '6px 8px',
                  border: '1px solid #bae6fd',
                  fontWeight: 700,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length ? filas.map((r, i) => (
            <tr key={`${r.nombre}-${i}`} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
              <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{r.nombre}</td>
              <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{r.cargo}</td>
              <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{r.empresa}</td>
              <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{r.entrada}</td>
              <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{r.salida}</td>
              <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{r.extra}</td>
              <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{r.justif}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={7} style={{ padding: 8, border: '1px solid #e2e8f0', color: '#64748b' }}>
                Sin personal registrado
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, marginTop: 6 }}>
        Total horas extra del día: {formatoHorasDecimal(totalExtra)}
      </div>

      <div style={{ fontWeight: 700, fontSize: 12, marginTop: 14 }}>
        Maquinaria en uso: {maqCount || '—'}
      </div>

      <div style={{
        display: 'flex',
        gap: 24,
        marginTop: 28,
        paddingTop: 12,
        borderTop: '1px solid #e2e8f0',
      }}>
        {[
          {
            label: 'Residente de obra',
            nombre: String(firmas?.elaboro_nombre || '').trim() || '—',
            cargo: String(firmas?.elaboro_cargo || '').trim() || 'Residente de obra',
          },
          {
            label: 'Director de obra',
            nombre: String(firmas?.reviso_nombre || '').trim() || '—',
            cargo: String(firmas?.reviso_cargo || '').trim() || 'Director de obra',
          },
        ].map((f) => (
          <div key={f.label} style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#1F4E70', marginBottom: 6 }}>
              {f.label}
            </div>
            <div style={{
              minHeight: 48,
              borderBottom: '1px solid #94a3b8',
              marginBottom: 6,
            }}
            />
            <div style={{ fontSize: 11, fontWeight: 700 }}>{f.nombre}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>{f.cargo}</div>
          </div>
        ))}
      </div>
    </div>
  )
})

export default BitacoraReporteDiarioPngCapture
