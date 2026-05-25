import { card } from './topografiaShared'
import { fmtNum } from '../../utils/topografia_angular'

const th = {
  textAlign: 'left',
  padding: '8px 6px',
  borderBottom: '2px solid #cbd5e1',
  fontSize: 'var(--cc-xs)',
  whiteSpace: 'nowrap',
}
const td = { padding: '6px', fontSize: 'var(--cc-xs)', borderBottom: '1px solid #e2e8f0' }

export default function PoligonalCalculoTable({ estaciones, poligonal, resultado }) {
  if (!estaciones?.length) {
    return (
      <div style={{ ...card, color: '#64748b' }}>
        Agregue estaciones y pulse Calcular para ver la libreta de poligonal.
      </div>
    )
  }

  const calculado = estaciones.some((e) => e.delta_norte != null)

  return (
    <div style={card}>
      <h4 style={{ marginTop: 0 }}>Libreta de calculo — Poligonal</h4>
      {poligonal && (
        <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-sm)', color: '#475569' }}>
          Tipo: {poligonal.tipo} | Tolerancia 1:{poligonal.tolerancia_relativa ?? 3000}
          {poligonal.error_lineal != null && <> | Error lineal: {fmtNum(poligonal.error_lineal, 4)} m</>}
          {poligonal.precision_relativa != null && <> | Precision: 1:{Math.round(poligonal.precision_relativa)}</>}
        </p>
      )}
      {!calculado && (
        <p style={{ color: '#92400e', fontSize: 'var(--cc-sm)', marginBottom: 12 }}>
          Proyecciones y coordenadas ajustadas aparecen despues de pulsar Calcular.
        </p>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={th}>#</th>
              <th style={th}>Punto</th>
              <th style={th}>Angulo observado</th>
              <th style={th}>Azimut inicio</th>
              <th style={th}>Azimut corregido</th>
              <th style={th}>Distancia (m)</th>
              <th style={th}>Proy. Norte</th>
              <th style={th}>Proy. Este</th>
              <th style={th}>Corr. Norte</th>
              <th style={th}>Corr. Este</th>
              <th style={th}>Norte</th>
              <th style={th}>Este</th>
            </tr>
          </thead>
          <tbody>
            {estaciones.map((e) => (
              <tr key={e.id || e.orden}>
                <td style={td}>{e.orden}</td>
                <td style={td}>{e.nombre_punto}</td>
                <td style={td}>{e.angulo_observado_texto ?? '—'}</td>
                <td style={td}>{e.azimut_inicio_texto ?? '—'}</td>
                <td style={td}>{e.azimut_corregido_texto ?? '—'}</td>
                <td style={td}>{fmtNum(e.distancia, 3)}</td>
                <td style={td}>{e.proyeccion_norte != null ? fmtNum(e.proyeccion_norte, 4) : '—'}</td>
                <td style={td}>{e.proyeccion_este != null ? fmtNum(e.proyeccion_este, 4) : '—'}</td>
                <td style={td}>{e.correccion_norte != null ? fmtNum(e.correccion_norte, 4) : '—'}</td>
                <td style={td}>{e.correccion_este != null ? fmtNum(e.correccion_este, 4) : '—'}</td>
                <td style={td}>{e.norte_ajustado != null ? fmtNum(e.norte_ajustado, 4) : '—'}</td>
                <td style={td}>{e.este_ajustado != null ? fmtNum(e.este_ajustado, 4) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {resultado && (
        <div style={{ marginTop: 12, fontSize: 'var(--cc-sm)' }}>
          <strong>Resumen del calculo:</strong>{' '}
          Error DN {fmtNum(resultado.error_dn, 4)} | Error DE {fmtNum(resultado.error_de, 4)} |{' '}
          Longitud {fmtNum(resultado.longitud_total, 3)} m
        </div>
      )}
    </div>
  )
}
