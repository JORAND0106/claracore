import { useMemo } from 'react'
import { useTopoTheme } from './topografiaShared'
import { topoSheetStyles } from './topoSheetStyles'
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
  /** Armadas del detalle: permiten mostrar/editar HI (altura_instrumento) en la cartera. */
  armadas = null,
  onUpdateHI = null,
  canEditHI = false,
}) {
  const ui = useTopoTheme()
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
  const th = sheet.th
  const td = sheet.td
  const acciones = onEditar || onEliminar
  const limite = cierre?.longitud_max_delta_m
  const ajustada = modoAjuste || !!poligonal?.ajustada_at

  const hiPorArmada = useMemo(() => {
    const map = new Map()
    for (const arm of armadas || []) {
      if (arm?.id) map.set(arm.id, arm)
      if (arm?.orden != null) map.set(`orden:${arm.orden}`, arm)
    }
    return map
  }, [armadas])

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
      <div style={sheet.sheetWrap} className="cc-topo-table-scroll">
        <table style={{ ...sheet.sheetTable, tableLayout: 'auto', minWidth: ajustada ? 1480 : 1060 }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={th}>Armada</th>
              <th style={th}>Punto</th>
              <th style={th}>Tipo</th>
              <th style={th}>Ang. obs.</th>
              {ajustada && <th style={th}>Ang. corr.</th>}
              <th style={th}>Ang. vert.</th>
              <th style={th}>Dist. (m)</th>
              <th style={th} title="Altura del instrumento (metros) de la armada">HI (m)</th>
              <th style={th}>HT (m)</th>
              <th style={th}>Azimut</th>
              {ajustada && (
                <>
                  <th style={th}>ΔN</th>
                  <th style={th}>ΔE</th>
                  <th style={th}>ΔZ</th>
                  <th style={th}>Corr.N</th>
                  <th style={th}>Corr.E</th>
                </>
              )}
              <th style={th}>Norte</th>
              <th style={th}>Este</th>
              <th style={th}>Cota</th>
              {acciones && <th style={th} />}
            </tr>
          </thead>
          <tbody>
            {estaciones.map((e) => {
              const ladoExcedido = advertenciaDistancia(e, cierre)
              const enEdicion = editandoId && e.id === editandoId
              const arm =
                (e.armada_id && hiPorArmada.get(e.armada_id)) ||
                (e.armada_orden != null ? hiPorArmada.get(`orden:${e.armada_orden}`) : null) ||
                null
              const hiVal = arm?.altura_instrumento
              const hiEditable = Boolean(canEditHI && onUpdateHI && arm?.id)
              return (
                <tr
                  key={e.id || e.orden}
                  style={enEdicion ? { background: ui.rowHighlight } : undefined}
                >
                  <td style={td}>{e.orden}</td>
                  <td style={td}>{e.armada_orden ?? '—'}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{e.nombre_punto}</td>
                  <td style={td}>
                    <span style={{
                      fontSize: 'var(--cc-xs)',
                      padding: '1px 6px',
                      borderRadius: 6,
                      ...(e.tipo_punto === 'estacion' ? ui.badgeEstacion : ui.badgeAux),
                    }}>
                      {e.tipo_punto === 'estacion' ? 'Estacion' : 'Auxiliar'}
                    </span>
                  </td>
                  <td style={td}>{e.angulo_observado_texto ?? '—'}</td>
                  {ajustada && <td style={td}>{e.angulo_corregido_texto ?? '—'}</td>}
                  <td style={td}>{e.angulo_vertical_texto ?? '—'}</td>
                  <td style={{ ...td, color: ladoExcedido ? ui.warn : undefined, fontWeight: ladoExcedido ? 700 : undefined }}>
                    {fmtNum(e.distancia, 3)}
                    {ladoExcedido && <AdvertenciaLado lado={ladoExcedido} limite={limite} />}
                  </td>
                  <td style={{ ...td, padding: hiEditable ? 2 : td.padding }}>
                    {hiEditable ? (
                      <input
                        key={`hi-${arm.id}-${hiVal ?? 'x'}`}
                        type="number"
                        step="0.001"
                        defaultValue={hiVal ?? ''}
                        onBlur={(ev) => {
                          if (String(ev.target.value) !== String(hiVal ?? '')) {
                            onUpdateHI(arm.id, ev.target.value)
                          }
                        }}
                        placeholder="1.500"
                        title="Altura del instrumento de esta armada (m). Se aplica a todos los puntos de la armada."
                        aria-label={`HI armada ${arm.orden ?? ''}`}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          border: hiVal == null || hiVal === '' ? '1px solid #f59e0b' : `1px solid ${sheet.border}`,
                          borderRadius: 4,
                          padding: '3px 4px',
                          fontSize: 'var(--cc-xs)',
                          background: hiVal == null || hiVal === '' ? '#fffbeb' : '#fff',
                          color: ui.text,
                          fontFamily: 'inherit',
                        }}
                      />
                    ) : (
                      hiVal != null && hiVal !== '' ? fmtNum(hiVal, 3) : '—'
                    )}
                  </td>
                  <td style={td}>{e.altura_objetivo != null ? fmtNum(e.altura_objetivo, 3) : '—'}</td>
                  <td style={{ ...td, color: ui.accent }}>{e.azimut_texto ?? '—'}</td>
                  {ajustada && (
                    <>
                      <td style={td}>{e.proyeccion_norte != null ? fmtNum(e.proyeccion_norte, 4) : '—'}</td>
                      <td style={td}>{e.proyeccion_este != null ? fmtNum(e.proyeccion_este, 4) : '—'}</td>
                      <td style={td}>{e.proyeccion_cota != null ? fmtNum(e.proyeccion_cota, 4) : '—'}</td>
                      <td style={td}>{e.correccion_norte != null ? fmtNum(e.correccion_norte, 4) : '—'}</td>
                      <td style={td}>{e.correccion_este != null ? fmtNum(e.correccion_este, 4) : '—'}</td>
                    </>
                  )}
                  <td style={td}>{e.norte != null ? fmtNum(e.norte, 4) : '—'}</td>
                  <td style={td}>{e.este != null ? fmtNum(e.este, 4) : '—'}</td>
                  <td style={td}>{e.cota != null ? fmtNum(e.cota, 4) : '—'}</td>
                  {acciones && (
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
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
