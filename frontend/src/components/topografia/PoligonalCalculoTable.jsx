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
        Agregue estaciones y pulse Calcular para ver la libreta de poligonal trigonométrica.
      </div>
    )
  }

  const calculado = estaciones.some((e) => e.delta_norte != null)

  return (
    <div style={card}>
      <h4 style={{ marginTop: 0 }}>Libreta de calculo — Poligonal trigonométrica</h4>
      {poligonal && (
        <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-sm)', color: '#475569' }}>
          Tipo: {poligonal.tipo} | Tolerancia plan 1:{poligonal.tolerancia_relativa ?? 3000}
          {' | '}Tolerancia cota: {poligonal.tolerancia_cota_mm_km ?? 12} mm/km
          {poligonal.error_lineal != null && <> | Error lineal: {fmtNum(poligonal.error_lineal, 4)} m</>}
          {poligonal.error_cierre_dz != null && <> | Error cota: {fmtNum(poligonal.error_cierre_dz, 4)} m</>}
          {poligonal.precision_relativa != null && <> | Precision: 1:{Math.round(poligonal.precision_relativa)}</>}
        </p>
      )}
      {!calculado && (
        <p style={{ color: '#92400e', fontSize: 'var(--cc-sm)', marginBottom: 12 }}>
          Proyecciones planimétricas, cotas y correcciones aparecen despues de pulsar Calcular.
        </p>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1400 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={th}>#</th>
              <th style={th}>Punto</th>
              <th style={th}>HI (m)</th>
              <th style={th}>Ang. horiz.</th>
              <th style={th}>Ang. vert.</th>
              <th style={th}>Dist. (m)</th>
              <th style={th}>LM</th>
              <th style={th}>Proy. N</th>
              <th style={th}>Proy. E</th>
              <th style={th}>Proy. Z</th>
              <th style={th}>Corr. N</th>
              <th style={th}>Corr. E</th>
              <th style={th}>Corr. Z</th>
              <th style={th}>Norte</th>
              <th style={th}>Este</th>
              <th style={th}>Cota</th>
            </tr>
          </thead>
          <tbody>
            {estaciones.map((e) => (
              <tr key={e.id || e.orden}>
                <td style={td}>{e.orden}</td>
                <td style={td}>{e.nombre_punto}</td>
                <td style={td}>{e.altura_instrumento != null ? fmtNum(e.altura_instrumento, 3) : '—'}</td>
                <td style={td}>{e.angulo_observado_texto ?? '—'}</td>
                <td style={td}>{e.angulo_vertical_texto ?? '—'}</td>
                <td style={td}>{fmtNum(e.distancia, 3)}</td>
                <td style={td}>{e.lectura_mira != null ? fmtNum(e.lectura_mira, 3) : '—'}</td>
                <td style={td}>{e.proyeccion_norte != null ? fmtNum(e.proyeccion_norte, 4) : '—'}</td>
                <td style={td}>{e.proyeccion_este != null ? fmtNum(e.proyeccion_este, 4) : '—'}</td>
                <td style={td}>{e.proyeccion_cota != null ? fmtNum(e.proyeccion_cota, 4) : '—'}</td>
                <td style={td}>{e.correccion_norte != null ? fmtNum(e.correccion_norte, 4) : '—'}</td>
                <td style={td}>{e.correccion_este != null ? fmtNum(e.correccion_este, 4) : '—'}</td>
                <td style={td}>{e.correccion_cota != null ? fmtNum(e.correccion_cota, 4) : '—'}</td>
                <td style={td}>{e.norte_ajustado != null ? fmtNum(e.norte_ajustado, 4) : '—'}</td>
                <td style={td}>{e.este_ajustado != null ? fmtNum(e.este_ajustado, 4) : '—'}</td>
                <td style={td}>{e.cota_ajustada != null ? fmtNum(e.cota_ajustada, 4) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {resultado && (
        <div style={{ marginTop: 12, fontSize: 'var(--cc-sm)' }}>
          <strong>Resumen:</strong>{' '}
          Error DN {fmtNum(resultado.error_dn, 4)} | Error DE {fmtNum(resultado.error_de, 4)} |{' '}
          Error DZ {fmtNum(resultado.error_dz, 4)} | Longitud {fmtNum(resultado.longitud_total, 3)} m
          {resultado.admisible_cota === false && (
            <span style={{ color: '#dc2626', marginLeft: 8 }}>Cierre de cota inadmisible</span>
          )}
        </div>
      )}
    </div>
  )
}
