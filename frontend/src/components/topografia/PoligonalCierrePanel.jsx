import { Semaforo, useTopoTheme, useTopoViewport } from './topografiaShared'
import { fmtNum, fmtRatio } from '../../utils/topografia_angular'

/**
 * Panel de cierre angular + lineal.
 * El cierre lineal mostrado es siempre el de campo (sin compensación Bowditch).
 */
export default function PoligonalCierrePanel({ cierre, cierrePreliminar = null }) {
  const { cierre: C } = useTopoTheme()
  const { isCompact } = useTopoViewport()
  if (!cierre) return null
  const seg = cierre.error_angular_seg
  const segTxt = seg === null || seg === undefined ? '—' : `${seg >= 0 ? '' : '-'}${Math.abs(seg).toFixed(1)}"`

  // Lineal principal = dato real de campo (preliminar), nunca el residual post-Bowditch (~0 / 1:1e9).
  const lin = (() => {
    const pre = cierrePreliminar
    const usarPre =
      pre &&
      (pre.error_lineal != null || pre.precision != null) &&
      (cierre.cierre_desde_coords_ajustadas ||
        cierre.cierre_lineal_es_campo ||
        pre.fuente === 'recalculado_campo' ||
        (Number(cierre.error_lineal) === 0 && pre.error_lineal != null && Number(pre.error_lineal) > 0))
    if (!usarPre) return cierre
    const tol = cierre.tolerancia_relativa
    const prec = pre.precision
    const admisible =
      prec != null && tol != null ? Number(prec) >= Number(tol) : pre.admisible_lineal ?? cierre.admisible_lineal
    return {
      ...cierre,
      delta_norte: pre.delta_norte ?? cierre.delta_norte,
      delta_este: pre.delta_este ?? cierre.delta_este,
      delta_cota: pre.delta_cota ?? cierre.delta_cota,
      error_lineal: pre.error_lineal ?? cierre.error_lineal,
      precision: pre.precision ?? cierre.precision,
      perimetro: pre.perimetro ?? cierre.perimetro,
      admisible_lineal: admisible,
    }
  })()

  return (
    <div
      className="cc-topo-cierre-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr',
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
              <td style={C.rowV}>
                {cierre.sentido === 'horario' ? 'Horario (ext.)' : 'Antihorario (int.)'}
                {cierre.sentido_auto && cierre.sentido_inferido && (
                  <span
                    title="Sentido identificado de forma semiautomática según Σ observada vs teórica (y winding si empata)"
                    style={{
                      marginLeft: 6,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      textTransform: 'uppercase',
                      background: '#f0fdf4',
                      color: '#166534',
                      border: '1px solid #bbf7d0',
                      borderRadius: 4,
                      padding: '1px 5px',
                      verticalAlign: 'middle',
                    }}
                  >
                    auto
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <td style={C.rowL}>Ángulos / Vértices</td>
              <td style={C.rowV}>{cierre.num_angulos} / {cierre.num_vertices}</td>
            </tr>
            <tr>
              <td style={C.rowL}>Σ Observada</td>
              <td style={C.rowV}>
                {cierre.suma_observada_texto ?? '—'}
                {cierre.angulos_derivados && (
                  <span
                    title="Ángulos internos/exteriores despejados de los azimuts reales: (Az_sig − Az_ant − 180°) mod 360. No son lecturas de campo."
                    style={{
                      marginLeft: 6,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      textTransform: 'uppercase',
                      background: '#ecfeff',
                      color: '#0e7490',
                      border: '1px solid #a5f3fc',
                      borderRadius: 4,
                      padding: '1px 5px',
                      verticalAlign: 'middle',
                    }}
                  >
                    derivado
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <td style={C.rowL}>Σ Teórica</td>
              <td style={C.rowV}>
                {cierre.suma_teorica_texto ?? '—'}
                {cierre.num_vertices != null && (
                  <span style={{ opacity: 0.75, fontWeight: 400 }}>
                    {cierre.sentido === 'horario' ? ' (n+2)×180°' : ' (n−2)×180°'}
                  </span>
                )}
              </td>
            </tr>
            <tr><td style={C.rowL}>Diferencia</td><td style={{ ...C.rowV, color: '#b45309' }}>{segTxt}</td></tr>
            {cierre.error_orientacion_seg != null && (
              <tr title="Azimut de arranque de la poligonal (primer lado) vs azimut de cierre / orientación final">
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
            {lin.admisible_cota === false && (
              <span style={{ fontSize: 9, background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: 4 }}>Cota</span>
            )}
            <Semaforo ok={!!lin.admisible_lineal} labelOk="CUMPLE" labelBad="NO CUMPLE" />
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', flex: 1 }}>
          <tbody>
            <tr><td style={C.rowL}>Perímetro</td><td style={C.rowV}>{fmtNum(lin.perimetro, 3)} m</td></tr>
            <tr>
              <td style={C.rowL}>ΔN / ΔE / ΔZ</td>
              <td style={C.rowV}>
                {fmtNum(lin.delta_norte, 4)} / {fmtNum(lin.delta_este, 4)} / {lin.delta_cota != null ? fmtNum(lin.delta_cota, 4) : '—'}
              </td>
            </tr>
            <tr><td style={C.rowL}>Error lineal</td><td style={C.rowV}>{fmtNum(lin.error_lineal, 4)} m</td></tr>
            {lin.tipo_pol === 'abierta' && lin.llegada_objetivo && (
              <tr>
                <td style={C.rowL}>Llegada obj.</td>
                <td style={C.rowV}>
                  N {fmtNum(lin.llegada_objetivo.norte, 4)} · E {fmtNum(lin.llegada_objetivo.este, 4)}
                </td>
              </tr>
            )}
            {lin.tipo_pol === 'abierta' && lin.llegada_calculada && (
              <tr>
                <td style={C.rowL}>Llegada calc.</td>
                <td style={C.rowV}>
                  N {fmtNum(lin.llegada_calculada.norte, 4)} · E {fmtNum(lin.llegada_calculada.este, 4)}
                </td>
              </tr>
            )}
            <tr>
              <td style={C.rowL}>Cierre obtenido</td>
              <td
                style={{
                  ...C.rowV,
                  background: lin.admisible_lineal ? '#dcfce7' : '#fee2e2',
                  color: lin.admisible_lineal ? '#166534' : '#991b1b',
                  fontWeight: 800,
                }}
                title="Precisión de campo (sin compensación Bowditch)"
              >
                {fmtRatio(lin.precision)}
              </td>
            </tr>
            <tr><td style={C.rowL}>Tolerancia plan</td><td style={C.rowV}>{fmtRatio(lin.tolerancia_relativa)}</td></tr>
            {lin.tolerancia_relativa_res643 != null && (
              <tr>
                <td style={C.rowL}>Tol. Res. 643</td>
                <td style={C.rowV}>
                  {fmtRatio(lin.tolerancia_relativa_res643)}
                  {lin.area_m2 != null && <span style={{ opacity: 0.75, fontWeight: 400 }}> · {fmtNum(lin.area_m2, 0)} m²</span>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
