import { useMemo } from 'react'
import { useTopoTheme } from './topografiaShared'
import { fmtNum } from '../../utils/topografia_angular'

function advertenciaDistancia(e, cierre) {
  if (!cierre?.lados_excedidos?.length) return null
  const dist = e.distancia
  if (dist == null || dist === '') return null
  const distNum = Number(dist)
  if (!Number.isFinite(distNum)) return null

  const excedidos = cierre.lados_excedidos || []
  const coincideLongitud = (l) => Math.abs((l.longitud || 0) - distNum) < 0.2

  if (e.id) {
    const porId = excedidos.find((l) => l.estacion_id === e.id && coincideLongitud(l))
    if (porId) return porId
  }

  return (
    excedidos.find(
      (l) => !l.es_cierre_amarre && l.hasta === e.nombre_punto && coincideLongitud(l),
    ) || null
  )
}

function AdvertenciaLado({ lado, limite }) {
  const msg = `Lado ${lado.desde} → ${lado.hasta}: ${fmtNum(lado.longitud, 3)} m supera el límite de ${fmtNum(limite, 0)} m entre estaciones (configuración de poligonal). Revise intervisibilidad y distancias de campo.`
  return (
    <span
      title={msg}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        marginLeft: 4,
        borderRadius: '50%',
        background: '#fef3c7',
        color: '#b45309',
        fontSize: 11,
        fontWeight: 800,
        cursor: 'help',
        verticalAlign: 'middle',
      }}
      aria-label={msg}
    >
      !
    </span>
  )
}

export default function PoligonalCalculoTable({
  estaciones,
  poligonal,
  cierre = null,
  editandoId = null,
  modoAjuste = false,
  onEliminar = null,
  onEditar = null,
}) {
  const ui = useTopoTheme()
  const acciones = onEditar || onEliminar
  const limite = cierre?.longitud_max_delta_m
  const ajustada = modoAjuste || !!poligonal?.ajustada_at

  const hayExcesos = useMemo(
    () => (cierre?.lados_excedidos?.length ?? 0) > 0,
    [cierre],
  )

  if (!estaciones?.length) {
    return (
      <div style={{ ...ui.card, color: ui.textMuted }}>
        Agregue puntos para ver la cartera de radiacion por armadas (ceros atras).
      </div>
    )
  }

  return (
    <div style={ui.card}>
      <h4 style={{ marginTop: 0, marginBottom: 6, color: ui.text }}>
        Cartera de calculo — Radiacion por armadas (ceros atras)
        {ajustada && <span style={{ fontWeight: 400, color: ui.success, fontSize: 'var(--cc-xs)' }}> · coordenadas ajustadas</span>}
      </h4>
      {poligonal && (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
          Tipo: {poligonal.tipo} | Tol. plan 1:{poligonal.tolerancia_relativa ?? 3000}
          {' | '}Cota {poligonal.tolerancia_cota_mm_km ?? 12} mm/km
          {limite != null && ` | Máx. entre deltas: ${fmtNum(limite, 0)} m`}
        </p>
      )}
      {hayExcesos && (
        <p style={{ color: '#92400e', fontSize: 'var(--cc-xs)', margin: '0 0 8px' }}>
          Revise las filas con el indicador de advertencia en distancia (superan el límite entre vértices).
        </p>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: ajustada ? 1400 : 980 }}>
          <thead>
            <tr>
              <th style={ui.th}>#</th>
              <th style={ui.th}>Armada</th>
              <th style={ui.th}>Punto</th>
              <th style={ui.th}>Tipo</th>
              <th style={ui.th}>Ang. obs.</th>
              {ajustada && <th style={ui.th}>Ang. corr.</th>}
              <th style={ui.th}>Ang. vert.</th>
              <th style={ui.th}>Dist. (m)</th>
              <th style={ui.th}>HT (m)</th>
              <th style={ui.th}>Azimut</th>
              {ajustada && (
                <>
                  <th style={ui.th}>ΔN</th>
                  <th style={ui.th}>ΔE</th>
                  <th style={ui.th}>ΔZ</th>
                  <th style={ui.th}>Corr.N</th>
                  <th style={ui.th}>Corr.E</th>
                </>
              )}
              <th style={ui.th}>Norte</th>
              <th style={ui.th}>Este</th>
              <th style={ui.th}>Cota</th>
              {acciones && <th style={ui.th} />}
            </tr>
          </thead>
          <tbody>
            {estaciones.map((e) => {
              const ladoExcedido = advertenciaDistancia(e, cierre)
              const enEdicion = editandoId && e.id === editandoId
              return (
                <tr
                  key={e.id || e.orden}
                  style={enEdicion ? { background: ui.rowHighlight } : undefined}
                >
                  <td style={ui.td}>{e.orden}</td>
                  <td style={ui.td}>{e.armada_orden ?? '—'}</td>
                  <td style={{ ...ui.td, fontWeight: 600 }}>{e.nombre_punto}</td>
                  <td style={ui.td}>
                    <span style={{
                      fontSize: 'var(--cc-xs)',
                      padding: '1px 6px',
                      borderRadius: 6,
                      ...(e.tipo_punto === 'estacion' ? ui.badgeEstacion : ui.badgeAux),
                    }}>
                      {e.tipo_punto === 'estacion' ? 'Estacion' : 'Auxiliar'}
                    </span>
                  </td>
                  <td style={ui.td}>{e.angulo_observado_texto ?? '—'}</td>
                  {ajustada && <td style={ui.td}>{e.angulo_corregido_texto ?? '—'}</td>}
                  <td style={ui.td}>{e.angulo_vertical_texto ?? '—'}</td>
                  <td style={{ ...ui.td, color: ladoExcedido ? ui.warn : undefined, fontWeight: ladoExcedido ? 700 : undefined }}>
                    {fmtNum(e.distancia, 3)}
                    {ladoExcedido && <AdvertenciaLado lado={ladoExcedido} limite={limite} />}
                  </td>
                  <td style={ui.td}>{e.altura_objetivo != null ? fmtNum(e.altura_objetivo, 3) : '—'}</td>
                  <td style={{ ...ui.td, color: ui.accent }}>{e.azimut_texto ?? '—'}</td>
                  {ajustada && (
                    <>
                      <td style={ui.td}>{e.proyeccion_norte != null ? fmtNum(e.proyeccion_norte, 4) : '—'}</td>
                      <td style={ui.td}>{e.proyeccion_este != null ? fmtNum(e.proyeccion_este, 4) : '—'}</td>
                      <td style={ui.td}>{e.proyeccion_cota != null ? fmtNum(e.proyeccion_cota, 4) : '—'}</td>
                      <td style={ui.td}>{e.correccion_norte != null ? fmtNum(e.correccion_norte, 4) : '—'}</td>
                      <td style={ui.td}>{e.correccion_este != null ? fmtNum(e.correccion_este, 4) : '—'}</td>
                    </>
                  )}
                  <td style={ui.td}>{e.norte != null ? fmtNum(e.norte, 4) : '—'}</td>
                  <td style={ui.td}>{e.este != null ? fmtNum(e.este, 4) : '—'}</td>
                  <td style={ui.td}>{e.cota != null ? fmtNum(e.cota, 4) : '—'}</td>
                  {acciones && (
                    <td style={{ ...ui.td, whiteSpace: 'nowrap' }}>
                      {onEditar && (
                        <button
                          type="button"
                          title="Editar punto"
                          onClick={() => onEditar(e)}
                          style={{ border: 'none', background: 'transparent', color: ui.link, cursor: 'pointer', fontSize: 'var(--cc-sm)', marginRight: 6 }}
                        >
                          ✎
                        </button>
                      )}
                      {onEliminar && (
                        <button
                          type="button"
                          title="Eliminar punto"
                          onClick={() => onEliminar(e.id)}
                          style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 'var(--cc-sm)' }}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
