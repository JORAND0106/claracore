import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  analizarCantidadesPorItem,
  costoDirectoDesdeListado,
  filtrarFilasPorAlerta,
  ordenarRegistrosVistaGeneral,
  resolverModoCantidadesPorItem,
  vuEfectivoFila,
} from './sicoeCantidadesPorItemHelpers'
import { pastelDeEstadoValidacion, estadoNivelRegistro } from './sicoeReporteItemsTablaHelpers'

function fmtNum(v, dig = 2) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('es-CO', { maximumFractionDigits: dig })
}

function fmtPesos(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `$ ${Math.round(n).toLocaleString('es-CO')}`
}

/**
 * Franja de cobertura rediseñada:
 * - Eje de abscisas con ticks legibles
 * - Carriles apilados para solapes (no se “funden” en un bloque sólido)
 * - Ancho mínimo visual + etiqueta Abs para segmentos cortos
 * - Vacíos rayados con etiqueta de brecha
 */
function FranjaCoberturaGrupo({ grupo, t, seleccionadoId, onSelectSegmento }) {
  const min = grupo.minAbs
  const max = grupo.maxAbs
  const span = min != null && max != null && max > min ? max - min : 0
  if (!span || !grupo.segmentos?.length) {
    return (
      <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, padding: '6px 0' }}>
        Sin rango de abscisas para graficar en este grupo.
      </div>
    )
  }

  const toPct = (abs) => ((abs - min) / span) * 100
  const vacios = grupo.vaciosIntervalos || []

  // Asignar carril a cada segmento para que solapes queden en filas distintas
  const lanes = []
  const segsConLane = [...grupo.segmentos]
    .sort((a, b) => a.absInicio - b.absInicio || a.absFin - b.absFin)
    .map((s) => {
      let lane = 0
      while (true) {
        const ocupado = (lanes[lane] || []).some(
          (o) => Math.min(s.absInicio, s.absFin) < Math.max(o.absInicio, o.absFin)
            && Math.max(s.absInicio, s.absFin) > Math.min(o.absInicio, o.absFin),
        )
        if (!ocupado) break
        lane += 1
      }
      if (!lanes[lane]) lanes[lane] = []
      lanes[lane].push(s)
      return { ...s, lane }
    })
  const nLanes = Math.max(1, lanes.length)
  const laneH = 22
  const trackH = nLanes * laneH + 8

  const ticks = []
  const nTicks = 5
  for (let i = 0; i <= nTicks; i++) {
    const abs = min + (span * i) / nTicks
    ticks.push({ abs, pct: (i / nTicks) * 100 })
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: t.text }}>{grupo.label}</span>
        <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
          Eje Abs {fmtNum(min, 3)} → {fmtNum(max, 3)}
          {grupo.solapes ? ` · ${grupo.solapes} en solape` : ''}
          {grupo.vacios ? ` · ${grupo.vacios} vacío(s)` : ''}
        </span>
      </div>

      {/* Escala */}
      <div style={{ position: 'relative', height: 16, marginBottom: 2 }}>
        {ticks.map((tk) => (
          <span
            key={tk.pct}
            style={{
              position: 'absolute',
              left: `${tk.pct}%`,
              transform: 'translateX(-50%)',
              fontSize: 10,
              color: t.textMuted,
              fontFamily: 'ui-monospace, Consolas, monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {fmtNum(tk.abs, 1)}
          </span>
        ))}
      </div>

      <div
        style={{
          position: 'relative',
          height: trackH,
          borderRadius: 8,
          background: '#f8fafc',
          border: `1px solid ${t.border}`,
          overflow: 'visible',
        }}
      >
        {/* Marcas verticales de escala */}
        {ticks.map((tk) => (
          <div
            key={`g-${tk.pct}`}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${tk.pct}%`,
              width: 1,
              background: 'rgba(148,163,184,0.35)',
              pointerEvents: 'none',
            }}
          />
        ))}

        {vacios.map((v, i) => {
          const left = toPct(v.desde)
          const width = Math.max(0.8, toPct(v.hasta) - toPct(v.desde))
          return (
            <div
              key={`v-${i}`}
              title={`Vacío (sin cobrar): ${fmtNum(v.desde, 3)} → ${fmtNum(v.hasta, 3)} · brecha ${fmtNum(v.brecha, 3)}`}
              style={{
                position: 'absolute',
                top: 2,
                bottom: 2,
                left: `${left}%`,
                width: `${width}%`,
                background: 'repeating-linear-gradient(135deg,#fbbf24 0 3px,#fffbeb 3px 7px)',
                border: '1px dashed #d97706',
                borderRadius: 4,
                zIndex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {width > 8 && (
                <span style={{ fontSize: 9, fontWeight: 800, color: '#92400e', whiteSpace: 'nowrap' }}>
                  vacío {fmtNum(v.brecha, 1)}
                </span>
              )}
            </div>
          )
        })}

        {segsConLane.map((s) => {
          const a0 = Math.min(s.absInicio, s.absFin)
          const a1 = Math.max(s.absInicio, s.absFin)
          const left = toPct(a0)
          const rawW = toPct(a1) - left
          const width = Math.max(1.2, rawW) // mínimo visual para no perder solapes puntuales
          const sel = String(seleccionadoId) === String(s.id)
          const top = 4 + s.lane * laneH
          const short = rawW < 6
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectSegmento?.(s.id)}
              title={`${s.solapa ? 'SOLAPE · ' : 'Cubierto · '}Reg #${s.numero_registro ?? s.id} · Abs ${fmtNum(a0, 3)}–${fmtNum(a1, 3)}`}
              style={{
                position: 'absolute',
                top,
                height: laneH - 4,
                left: `${left}%`,
                width: `${width}%`,
                border: sel ? '2px solid #0f172a' : s.solapa ? '1px solid #991b1b' : '1px solid #0369a1',
                borderRadius: 4,
                background: s.solapa ? '#ef4444' : '#0ea5e9',
                boxShadow: s.solapa ? '0 0 0 1px rgba(127,29,29,0.35)' : 'none',
                cursor: 'pointer',
                padding: 0,
                zIndex: s.solapa ? 3 : 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: short ? 'flex-start' : 'center',
                overflow: 'visible',
              }}
            >
              {!short && (
                <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', padding: '0 4px', whiteSpace: 'nowrap', textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>
                  {fmtNum(a0, 1)}–{fmtNum(a1, 1)}
                </span>
              )}
              {short && (
                <span
                  style={{
                    position: 'absolute',
                    left: '100%',
                    marginLeft: 4,
                    fontSize: 9,
                    fontWeight: 700,
                    color: s.solapa ? '#991b1b' : '#0369a1',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                  }}
                >
                  {fmtNum(a0, 1)}–{fmtNum(a1, 1)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Vista módulo: Cantidades por Ítem.
 * Filtros: solo el modal general de SicoeObra (sin selector propio).
 * Modos: vacio | general | analisis.
 */
export default function SicoeCantidadesPorItemVista({
  t,
  contratoId,
  token,
  API_URL,
  nivelInfo,
  nivelesContrato,
  busquedaActiva = false,
  buildFiltrosParams,
  onAbrirRegistro,
  onSeleccionCambio,
  onValidarRapido,
  ejecutandoValidacion = false,
  refreshNonce = 0,
  filtrosVersion = 0,
}) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [payload, setPayload] = useState(null)
  const [seleccionadoId, setSeleccionadoId] = useState(null)
  const [filtroAlerta, setFiltroAlerta] = useState('todos')

  const cargar = useCallback(async () => {
    if (!contratoId || !token || !busquedaActiva) {
      setPayload(null)
      setError(null)
      return
    }
    if (typeof buildFiltrosParams !== 'function') return
    setCargando(true)
    setError(null)
    try {
      const params = buildFiltrosParams()
      if (!params || ![...params.keys()].length) {
        setPayload({ ok: true, modo: 'vacio', total: 0, items_distintos: 0, registros: [] })
        return
      }
      const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/cantidades-por-item?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.detail || `Error ${res.status}`)
      setPayload(data)
      setFiltroAlerta('todos')
    } catch (e) {
      setPayload(null)
      setError(e?.message || String(e))
    } finally {
      setCargando(false)
    }
  }, [API_URL, contratoId, token, busquedaActiva, buildFiltrosParams])

  useEffect(() => {
    void cargar()
  }, [cargar, refreshNonce, filtrosVersion])

  const modo = useMemo(
    () => resolverModoCantidadesPorItem({ busquedaActiva, payload }),
    [busquedaActiva, payload],
  )

  const analisis = useMemo(() => {
    if (modo === 'analisis') return analizarCantidadesPorItem(payload?.registros || [])
    return null
  }, [modo, payload])

  const filasBase = useMemo(() => {
    if (modo === 'analisis') return analisis?.filas || []
    if (modo === 'general') return ordenarRegistrosVistaGeneral(payload?.registros || [])
    return []
  }, [modo, analisis, payload])

  const filas = useMemo(() => {
    if (modo !== 'analisis') return filasBase
    return filtrarFilasPorAlerta(filasBase, filtroAlerta)
  }, [modo, filasBase, filtroAlerta])

  const nvUsuario = Number(nivelInfo?.nivelValidacion) || null
  const verEco = !!nivelInfo?.verValoresEconomicos && !payload?.ocultar_costo_directo
  const nivelesActivos = Array.isArray(nivelesContrato?.niveles_activos)
    ? nivelesContrato.niveles_activos
    : [1, 2, 3]

  const seleccionar = (id) => {
    setSeleccionadoId(id)
    const fila = filasBase.find((f) => String(f.id) === String(id))
      || filas.find((f) => String(f.id) === String(id))
    onSeleccionCambio?.(fila || null, {
      capitulo: fila?.capitulo || payload?.capitulo,
      item: fila?.item_numero || payload?.item,
    })
  }

  const puedeValidarFila = (reg) =>
    !!nivelInfo?.puedeValidar &&
    nvUsuario >= 1 &&
    nvUsuario <= 6 &&
    !reg?.bloqueado &&
    !!String(reg?.item_numero || '').trim()

  const colCount = (modo === 'analisis' ? 1 : 0) + 14 + (modo === 'general' ? 2 : 0) + (verEco ? 1 : 0) + 3

  const headers = useMemo(() => {
    const base = []
    if (modo === 'analisis') base.push('Alertas')
    base.push('Reporte', 'Reg.')
    if (modo === 'general') base.push('Capítulo', 'Ítem')
    base.push('Tramo', 'Infraestructura', 'Abs Inicio', 'Abs Fin', 'Long', 'Ancho', 'Espesor', 'Cantidad', 'Cant. Total')
    if (verEco) base.push('Costo Directo')
    base.push('Observación', 'Foto', 'Gráfico', 'Validación')
    return base
  }, [modo, verEco])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: '12px 14px',
        }}
      >
        <div style={{ fontSize: 'var(--cc-md)', fontWeight: 800, color: t.text }}>
          Cantidades por ítem
        </div>
        <div style={{ marginTop: 4, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
          Use el modal de <strong style={{ color: t.text }}>Filtros</strong> (igual que en Reportes).
          {modo === 'analisis' && ' · Modo análisis: solapes / vacíos / espesores activos.'}
          {modo === 'general' && ' · Modo consulta: varios ítems, sin análisis de inconsistencias.'}
        </div>
        {cargando && (
          <div style={{ marginTop: 8, fontSize: 'var(--cc-sm)', color: t.textMuted }}>Cargando registros…</div>
        )}
        {error && (
          <div style={{ marginTop: 8, color: '#b91c1c', fontSize: 'var(--cc-sm)', fontWeight: 600 }}>{error}</div>
        )}
        {modo === 'analisis' && payload && (
          <div style={{ marginTop: 8, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            <strong style={{ color: t.text }}>{payload.item}</strong>
            {payload.item_descripcion ? ` · ${payload.item_descripcion}` : ''}
            {payload.unidad ? ` · ${payload.unidad}` : ''}
            {verEco && payload.vlr_unitario_listado
              ? ` · VU listado ${fmtPesos(payload.vlr_unitario_listado)}`
              : ''}
            {` · ${payload.total ?? 0} registro(s)`}
          </div>
        )}
        {modo === 'general' && payload && (
          <div style={{ marginTop: 8, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            {payload.items_distintos ?? 0} ítem(s) · {payload.total ?? 0} registro(s)
          </div>
        )}
      </div>

      {!busquedaActiva && (
        <div
          style={{
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            padding: '28px 16px',
            textAlign: 'center',
            color: t.textMuted,
            fontSize: 'var(--cc-sm)',
          }}
        >
          Defina criterios en <strong style={{ color: t.text }}>Filtros</strong> y pulse <strong style={{ color: t.text }}>Buscar</strong> para ver cantidades por ítem.
        </div>
      )}

      {busquedaActiva && modo === 'vacio' && !cargando && !error && (
        <div
          style={{
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            padding: '24px 16px',
            textAlign: 'center',
            color: t.textMuted,
            fontSize: 'var(--cc-sm)',
          }}
        >
          Sin registros con ítem asignado para estos filtros.
        </div>
      )}

      {modo === 'analisis' && analisis && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            alignItems: 'center',
          }}
        >
          <ResumenChip
            label="Solapes"
            value={analisis.resumen.solapes}
            color="#dc2626"
            title="Clic: mostrar solo filas con solape"
            active={filtroAlerta === 'solapes'}
            onClick={() => setFiltroAlerta((f) => (f === 'solapes' ? 'todos' : 'solapes'))}
          />
          <ResumenChip
            label="Vacíos"
            value={analisis.resumen.vacios}
            color="#d97706"
            title="Clic: mostrar solo filas con vacío previo"
            active={filtroAlerta === 'vacios'}
            onClick={() => setFiltroAlerta((f) => (f === 'vacios' ? 'todos' : 'vacios'))}
          />
          <ResumenChip
            label="Espesores atípicos"
            value={analisis.resumen.espesoresAtipicos}
            color="#7c3aed"
            title="Clic: mostrar solo espesores ≠ moda del grupo"
            active={filtroAlerta === 'espesores'}
            onClick={() => setFiltroAlerta((f) => (f === 'espesores' ? 'todos' : 'espesores'))}
          />
          <ResumenChip
            label="Registros"
            value={analisis.resumen.total}
            color={t.primary}
            title="Total de líneas del ítem (informativo)"
          />
          {filtroAlerta !== 'todos' && (
            <button
              type="button"
              onClick={() => setFiltroAlerta('todos')}
              style={{
                marginLeft: 4,
                background: 'transparent',
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 'var(--cc-caption)',
                fontWeight: 700,
                color: t.textMuted,
                cursor: 'pointer',
              }}
            >
              Quitar filtro de alerta
            </button>
          )}
        </div>
      )}

      {modo === 'analisis' && analisis?.grupos?.length > 0 && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: t.text, marginBottom: 8 }}>
            Cobertura de abscisas por Tramo · Infraestructura
          </div>
          {analisis.grupos.map((g) => (
            <FranjaCoberturaGrupo
              key={g.key}
              grupo={g}
              t={t}
              seleccionadoId={seleccionadoId}
              onSelectSegmento={seleccionar}
            />
          ))}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 'var(--cc-caption)', color: t.textMuted }}>
            <span><span style={{ display: 'inline-block', width: 14, height: 10, background: '#0ea5e9', borderRadius: 2, marginRight: 4 }} />Cubierto</span>
            <span><span style={{ display: 'inline-block', width: 14, height: 10, background: '#ef4444', borderRadius: 2, marginRight: 4 }} />Solape (carril aparte)</span>
            <span><span style={{ display: 'inline-block', width: 14, height: 10, background: 'repeating-linear-gradient(135deg,#fbbf24 0 3px,#fffbeb 3px 7px)', border: '1px dashed #d97706', borderRadius: 2, marginRight: 4 }} />Vacío sin cobrar</span>
          </div>
        </div>
      )}

      {(modo === 'analisis' || modo === 'general') && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'auto' }}>
          <table className="cc-sicoe-panel-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', minWidth: verEco ? 1380 : 1180 }}>
            <thead>
              <tr style={{ background: t.bg, color: t.textMuted, fontSize: 'var(--cc-caption)', fontWeight: 800 }}>
                {headers.map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 10px',
                      textAlign: ['Observación', 'Tramo', 'Infraestructura', 'Capítulo', 'Ítem', 'Alertas'].includes(h) ? 'left' : 'right',
                      borderBottom: `1px solid ${t.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={headers.length || colCount} style={{ padding: 24, textAlign: 'center', color: t.textMuted }}>
                    {filtroAlerta !== 'todos'
                      ? 'Ningún registro coincide con el filtro de alerta seleccionado.'
                      : 'No hay registros con ítem asignado para esta consulta.'}
                  </td>
                </tr>
              ) : (
                filas.map((reg) => {
                  const sel = String(seleccionadoId) === String(reg.id)
                  const bg = modo === 'analisis' && reg._alertaSolape
                    ? 'rgba(220,38,38,0.10)'
                    : modo === 'analisis' && reg._alertaVacioAntes
                      ? 'rgba(217,119,6,0.10)'
                      : modo === 'analisis' && reg._alertaEspesorAtipico
                        ? 'rgba(124,58,237,0.08)'
                        : sel
                          ? `${t.primary}14`
                          : 'transparent'
                  const vu = vuEfectivoFila(reg, payload?.vlr_unitario_listado)
                  const cd = verEco
                    ? (reg.costo_directo_calc ?? costoDirectoDesdeListado(reg.cantidad_total ?? reg.cantidad, vu))
                    : null
                  const est = nvUsuario ? estadoNivelRegistro(reg, nvUsuario) : 'No Revisado'
                  const pastel = pastelDeEstadoValidacion(est)
                  const fotoOk = !!String(reg.foto_url || '').trim()
                  const grafOk = !!String(reg.grafico_url || '').trim() || (Array.isArray(reg.graficos_historial) && reg.graficos_historial.length > 0)
                  return (
                    <tr
                      key={reg.id}
                      onClick={() => seleccionar(reg.id)}
                      style={{ background: bg, cursor: 'pointer', borderBottom: `1px solid ${t.border}33` }}
                    >
                      {modo === 'analisis' && (
                        <td style={{ padding: '7px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                          {reg._alertaSolape && <Badge color="#dc2626" title="Posible solape de abscisas">Solape</Badge>}
                          {reg._alertaVacioAntes && (
                            <Badge
                              color="#d97706"
                              title={`Vacío ${fmtNum(reg._alertaVacioAntes.desde, 3)} → ${fmtNum(reg._alertaVacioAntes.hasta, 3)}`}
                            >
                              Vacío
                            </Badge>
                          )}
                          {reg._alertaEspesorAtipico && (
                            <Badge color="#7c3aed" title={`Espesor atípico (moda grupo: ${fmtNum(reg._espesorModaGrupo, 3)})`}>
                              Esp.≠
                            </Badge>
                          )}
                          {!reg._alertaSolape && !reg._alertaVacioAntes && !reg._alertaEspesorAtipico && (
                            <span style={{ color: t.textMuted }}>—</span>
                          )}
                        </td>
                      )}
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: t.primary, fontWeight: 700 }}>
                        #{reg.numero_reporte ?? '—'}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>#{reg.numero_registro ?? '—'}</td>
                      {modo === 'general' && (
                        <>
                          <td style={{ padding: '7px 8px', textAlign: 'left' }}>{reg.capitulo || '—'}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'left', fontWeight: 700 }}>{reg.item_numero || '—'}</td>
                        </>
                      )}
                      <td style={{ padding: '7px 8px', textAlign: 'left', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={reg.tramo || ''}>{reg.tramo || '—'}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'left', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={reg.infraestructura || ''}>{reg.infraestructura || '—'}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'ui-monospace, Consolas, monospace' }}>{fmtNum(reg.abs_inicio, 3)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'ui-monospace, Consolas, monospace' }}>{fmtNum(reg.abs_final, 3)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmtNum(reg.longitud)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmtNum(reg.ancho)}</td>
                      <td
                        style={{
                          padding: '7px 8px',
                          textAlign: 'right',
                          fontWeight: reg._alertaEspesorAtipico ? 800 : 400,
                          color: reg._alertaEspesorAtipico ? '#7c3aed' : t.text,
                        }}
                      >
                        {fmtNum(reg.espesor, 3)}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmtNum(reg.cantidad)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtNum(reg.cantidad_total)}</td>
                      {verEco && (
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: t.primary, fontWeight: 700 }}>{fmtPesos(cd)}</td>
                      )}
                      <td style={{ padding: '7px 8px', textAlign: 'left', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={reg.observacion || ''}>
                        {reg.observacion || '—'}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                        {fotoOk ? (
                          <button
                            type="button"
                            title="Ver fotografía en carpeta del reporte"
                            onClick={(e) => { e.stopPropagation(); onAbrirRegistro?.(reg) }}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                          >
                            📷
                          </button>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                        {grafOk ? (
                          <button
                            type="button"
                            title="Ver gráfico/esquema en carpeta del reporte"
                            onClick={(e) => { e.stopPropagation(); onAbrirRegistro?.(reg) }}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                          >
                            📐
                          </button>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              fontSize: 'var(--cc-caption)',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: pastel.bg,
                              border: pastel.border !== 'transparent' ? `1px solid ${pastel.border}` : '1px solid transparent',
                              color: pastel.color || t.textMuted,
                            }}
                          >
                            {est === 'No Revisado' ? 'Sin rev.' : est}
                          </span>
                          {puedeValidarFila(reg) && (
                            <button
                              type="button"
                              disabled={ejecutandoValidacion || est === 'Aprobado'}
                              title="Aprobar en mi nivel"
                              onClick={() => onValidarRapido?.(reg, 'Aprobado')}
                              style={{
                                background: '#16a34a',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 6,
                                padding: '3px 8px',
                                fontSize: 'var(--cc-caption)',
                                fontWeight: 800,
                                cursor: ejecutandoValidacion || est === 'Aprobado' ? 'not-allowed' : 'pointer',
                                opacity: ejecutandoValidacion || est === 'Aprobado' ? 0.45 : 1,
                              }}
                            >
                              ✓
                            </button>
                          )}
                          <button
                            type="button"
                            title="Abrir en carpeta del reporte"
                            onClick={() => onAbrirRegistro?.(reg)}
                            style={{
                              background: 'transparent',
                              border: `1px solid ${t.border}`,
                              borderRadius: 6,
                              padding: '3px 8px',
                              fontSize: 'var(--cc-caption)',
                              fontWeight: 700,
                              color: t.primary,
                              cursor: 'pointer',
                            }}
                          >
                            Abrir
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          {nivelesActivos?.length > 0 && nvUsuario && (
            <div style={{ padding: '8px 12px', fontSize: 'var(--cc-caption)', color: t.textMuted, borderTop: `1px solid ${t.border}` }}>
              Costo directo = Cant. Total × VU de listado de precios (por capítulo+ítem de cada fila).
              {modo === 'analisis' ? ' Contadores Solapes/Vacíos/Espesores filtran la grilla al hacer clic.' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ResumenChip({ label, value, color, title, onClick, active }) {
  const interactive = typeof onClick === 'function'
  const Comp = interactive ? 'button' : 'div'
  return (
    <Comp
      type={interactive ? 'button' : undefined}
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 999,
        border: active ? `2px solid ${color}` : `1px solid ${color}55`,
        background: active ? `${color}28` : `${color}14`,
        cursor: interactive ? 'pointer' : 'default',
        boxShadow: active ? `0 0 0 2px ${color}33` : 'none',
      }}
    >
      <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color }}>{label}</span>
      <strong style={{ fontSize: 'var(--cc-md)', color, fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
    </Comp>
  )
}

function Badge({ children, color, title }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        marginRight: 4,
        padding: '1px 6px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.02em',
        color: '#fff',
        background: color,
      }}
    >
      {children}
    </span>
  )
}
