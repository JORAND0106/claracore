import { Semaforo, useTopoTheme } from './topografiaShared'
import { fmtNum, fmtRatio } from '../../utils/topografia_angular'

/**
 * Panel de cierre angular + lineal (dos columnas iguales).
 */
export default function PoligonalCierrePanel({ cierre }) {
  const { cierre: C } = useTopoTheme()
  if (!cierre) return null
  const seg = cierre.error_angular_seg
  const segTxt = seg === null || seg === undefined ? '—' : `${seg >= 0 ? '' : '-'}${Math.abs(seg).toFixed(1)}"`

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
        alignItems: 'stretch',
        width: '100%',
      }}
    >
      <div style={C.box}>
        <div style={C.head}>
          <span>Cierre angular</span>
          {cierre.admisible_angular !== null && cierre.admisible_angular !== undefined && (
            <Semaforo ok={cierre.admisible_angular} labelOk="CUMPLE" labelBad="REVISAR" />
          )}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', flex: 1 }}>
          <tbody>
            <tr>
              <td style={C.rowL}>Sentido</td>
              <td style={C.rowV}>{cierre.sentido === 'horario' ? 'Horario (ext.)' : 'Antihorario (int.)'}</td>
            </tr>
            <tr>
              <td style={C.rowL}>Ángulos / Vértices</td>
              <td style={C.rowV}>{cierre.num_angulos} / {cierre.num_vertices}</td>
            </tr>
            <tr><td style={C.rowL}>Σ Observada</td><td style={C.rowV}>{cierre.suma_observada_texto ?? '—'}</td></tr>
            <tr>
              <td style={C.rowL}>Σ Teórica</td>
              <td style={C.rowV}>
                {cierre.suma_teorica_texto ?? '—'}
                {cierre.tiene_orientacion && (
                  <span style={{ opacity: 0.75, fontWeight: 400 }}> (n+2)×180°</span>
                )}
              </td>
            </tr>
            <tr><td style={C.rowL}>Diferencia</td><td style={{ ...C.rowV, color: '#b45309' }}>{segTxt}</td></tr>
            {cierre.error_orientacion_seg != null && (
              <tr title="Azimut al visado de referencia al inicio vs al final (ceros atrás)">
                <td style={C.rowL}>Orient. ref.</td>
                <td style={C.rowV}>
                  {cierre.error_orientacion_seg >= 0 ? '' : '-'}
                  {Math.abs(cierre.error_orientacion_seg).toFixed(1)}&quot;
                  <span style={{ opacity: 0.75, fontWeight: 400, display: 'block', fontSize: 10 }}>
                    {cierre.azimut_referencia_inicial_texto ?? '—'} → {cierre.azimut_referencia_final_texto ?? '—'}
                  </span>
                </td>
              </tr>
            )}
            {cierre.tolerancia_angular_seg != null && (
              <tr>
                <td style={C.rowL}>Tolerancia</td>
                <td style={C.rowV}>
                  ± {cierre.tolerancia_angular_seg}"
                  <span style={{ opacity: 0.75, fontWeight: 400 }}> ({cierre.precision_angular_equipo_seg ?? 10}"×√{cierre.num_vertices || cierre.num_angulos})</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={C.box}>
        <div style={C.head}>
          <span>Cierre lineal</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {cierre.admisible_cota === false && (
              <span style={{ fontSize: 9, background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: 4 }}>Cota</span>
            )}
            <Semaforo ok={!!cierre.admisible_lineal} labelOk="CUMPLE" labelBad="NO CUMPLE" />
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', flex: 1 }}>
          <tbody>
            <tr><td style={C.rowL}>Perímetro</td><td style={C.rowV}>{fmtNum(cierre.perimetro, 3)} m</td></tr>
            <tr>
              <td style={C.rowL}>ΔN / ΔE / ΔZ</td>
              <td style={C.rowV}>
                {fmtNum(cierre.delta_norte, 4)} / {fmtNum(cierre.delta_este, 4)} / {cierre.delta_cota != null ? fmtNum(cierre.delta_cota, 4) : '—'}
              </td>
            </tr>
            <tr><td style={C.rowL}>Error lineal</td><td style={C.rowV}>{fmtNum(cierre.error_lineal, 4)} m</td></tr>
            {cierre.tipo_pol === 'abierta' && cierre.llegada_objetivo && (
              <tr>
                <td style={C.rowL}>Llegada obj.</td>
                <td style={C.rowV}>
                  N {fmtNum(cierre.llegada_objetivo.norte, 4)} · E {fmtNum(cierre.llegada_objetivo.este, 4)}
                </td>
              </tr>
            )}
            {cierre.tipo_pol === 'abierta' && cierre.llegada_calculada && (
              <tr>
                <td style={C.rowL}>Llegada calc.</td>
                <td style={C.rowV}>
                  N {fmtNum(cierre.llegada_calculada.norte, 4)} · E {fmtNum(cierre.llegada_calculada.este, 4)}
                </td>
              </tr>
            )}
            <tr>
              <td style={C.rowL}>Cierre obtenido</td>
              <td style={{ ...C.rowV, background: cierre.admisible_lineal ? '#dcfce7' : '#fee2e2', color: cierre.admisible_lineal ? '#166534' : '#991b1b', fontWeight: 800 }}>
                {fmtRatio(cierre.precision)}
              </td>
            </tr>
            <tr><td style={C.rowL}>Tolerancia plan</td><td style={C.rowV}>{fmtRatio(cierre.tolerancia_relativa)}</td></tr>
            {cierre.tolerancia_relativa_res643 != null && (
              <tr>
                <td style={C.rowL}>Tol. Res. 643</td>
                <td style={C.rowV}>
                  {fmtRatio(cierre.tolerancia_relativa_res643)}
                  {cierre.area_m2 != null && <span style={{ opacity: 0.75, fontWeight: 400 }}> · {fmtNum(cierre.area_m2, 0)} m²</span>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
