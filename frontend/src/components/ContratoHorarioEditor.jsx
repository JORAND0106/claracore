/**
 * Editor de horario laboral semanal (Bitácora) — tabla tipo Excel.
 */
import {
  DIAS_SEMANA,
  horasLaborablesDia,
  horasSemanales,
  normalizeHorario,
  NOCTURNO_FIN_DEFAULT,
  NOCTURNO_INICIO_DEFAULT,
} from '../modules/seguimiento/bitacoraHorario'

export default function ContratoHorarioEditor({
  t,
  value,
  onChange,
  disabled = false,
}) {
  const horario = normalizeHorario(value)
  const totalSemana = horasSemanales(horario)

  const patchDia = (key, patch) => {
    if (disabled) return
    const next = normalizeHorario(horario)
    next.dias[key] = { ...next.dias[key], ...patch }
    if (patch.laborable === false) {
      next.dias[key].entrada = ''
      next.dias[key].salida = ''
      next.dias[key].almuerzo_inicio = ''
      next.dias[key].almuerzo_fin = ''
    }
    onChange?.(next)
  }

  const patchNocturno = (field, value) => {
    if (disabled) return
    const next = normalizeHorario(horario)
    next[field] = value || (field === 'nocturno_inicio' ? NOCTURNO_INICIO_DEFAULT : NOCTURNO_FIN_DEFAULT)
    onChange?.(next)
  }

  const cellInp = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 8px',
    borderRadius: 6,
    border: `1px solid ${t?.border || '#cbd5e1'}`,
    background: t?.inputBg || t?.bg || '#fff',
    color: t?.text || '#0f172a',
    fontSize: 13,
  }

  return (
    <div>
      <div style={{
        fontSize: 'var(--cc-sm, 13px)',
        color: t?.textMuted || '#64748b',
        marginBottom: 12,
        lineHeight: 1.45,
      }}>
        Configure el horario por día. Las horas laborables descuentan el almuerzo
        cuando está definido. Rige desde la fecha en que guarde el contrato;
        las bitácoras ya registradas conservan el horario con que se diligenciaron.
        Sin horario configurado se usa 07:30–16:30 (Lun–Vie) con almuerzo 12:00–13:00.
        La franja nocturna (por defecto 19:00–06:00) clasifica el tiempo extra;
        ajústela solo si la norma o el contrato lo requieren.
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'flex-end',
        marginBottom: 14,
        padding: '10px 12px',
        borderRadius: 8,
        border: `1px solid ${t?.border || '#e2e8f0'}`,
        background: t?.inputBg || '#f8fafc',
      }}>
        <div style={{
          fontWeight: 800,
          fontSize: 12,
          color: t?.textMuted || '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
          width: '100%',
        }}>
          Horario nocturno (tiempo extra)
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: t?.textMuted || '#64748b' }}>
          Inicio nocturno
          <input
            type="time"
            value={horario.nocturno_inicio || NOCTURNO_INICIO_DEFAULT}
            disabled={disabled}
            onChange={(e) => patchNocturno('nocturno_inicio', e.target.value)}
            aria-label="Inicio de horario nocturno"
            style={{ ...cellInp, width: 130 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: t?.textMuted || '#64748b' }}>
          Fin nocturno
          <input
            type="time"
            value={horario.nocturno_fin || NOCTURNO_FIN_DEFAULT}
            disabled={disabled}
            onChange={(e) => patchNocturno('nocturno_fin', e.target.value)}
            aria-label="Fin de horario nocturno"
            style={{ ...cellInp, width: 130 }}
          />
        </label>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          minWidth: 640,
        }}>
          <thead>
            <tr style={{ background: t?.primary ? `${t.primary}14` : '#e0f2fe' }}>
              {['Día', 'Laborable', 'Entrada', 'Salida', 'Almuerzo inicio', 'Almuerzo fin', 'Horas'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === 'Día' || h === 'Laborable' ? 'left' : 'center',
                    padding: '8px 10px',
                    borderBottom: `1px solid ${t?.border || '#e2e8f0'}`,
                    color: t?.textMuted || '#64748b',
                    fontWeight: 800,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIAS_SEMANA.map((d) => {
              const row = horario.dias[d.key]
              const hrs = horasLaborablesDia(row)
              return (
                <tr key={d.key}>
                  <td style={{
                    padding: '8px 10px',
                    borderBottom: `1px solid ${t?.border || '#e2e8f0'}`,
                    fontWeight: 700,
                    color: t?.text || '#0f172a',
                    whiteSpace: 'nowrap',
                  }}>
                    {d.label}
                  </td>
                  <td style={{
                    padding: '8px 10px',
                    borderBottom: `1px solid ${t?.border || '#e2e8f0'}`,
                  }}>
                    <input
                      type="checkbox"
                      checked={Boolean(row.laborable)}
                      disabled={disabled}
                      onChange={(e) => patchDia(d.key, { laborable: e.target.checked })}
                      aria-label={`${d.label} laborable`}
                    />
                  </td>
                  {['entrada', 'salida', 'almuerzo_inicio', 'almuerzo_fin'].map((field) => (
                    <td
                      key={field}
                      style={{
                        padding: '6px 8px',
                        borderBottom: `1px solid ${t?.border || '#e2e8f0'}`,
                      }}
                    >
                      <input
                        type="time"
                        value={row[field] || ''}
                        disabled={disabled || !row.laborable}
                        onChange={(e) => patchDia(d.key, { [field]: e.target.value })}
                        style={{
                          ...cellInp,
                          opacity: row.laborable ? 1 : 0.45,
                        }}
                      />
                    </td>
                  ))}
                  <td style={{
                    padding: '8px 10px',
                    borderBottom: `1px solid ${t?.border || '#e2e8f0'}`,
                    textAlign: 'center',
                    fontWeight: 700,
                    color: t?.text || '#0f172a',
                  }}>
                    {row.laborable ? (hrs > 0 ? hrs.toFixed(2) : '—') : '—'}
                  </td>
                </tr>
              )
            })}
            <tr>
              <td
                colSpan={6}
                style={{
                  padding: '10px',
                  borderTop: `2px solid ${t?.border || '#cbd5e1'}`,
                  fontWeight: 800,
                  color: t?.text || '#0f172a',
                  background: t?.inputBg || '#f8fafc',
                }}
              >
                Total semanal
              </td>
              <td style={{
                padding: '10px',
                borderTop: `2px solid ${t?.border || '#cbd5e1'}`,
                textAlign: 'center',
                fontWeight: 800,
                color: t?.primary || '#0077B6',
                background: t?.inputBg || '#f8fafc',
              }}>
                {totalSemana.toFixed(2)} h
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
