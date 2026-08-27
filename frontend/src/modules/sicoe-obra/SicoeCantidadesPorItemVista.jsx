import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  analizarCantidadesPorItem,
  costoDirectoDesdeListado,
  filtrarFilasPorAlerta,
  gruposFranjaSoloAlertas,
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
 * Franja «A revisar»: línea delgada de abscisas del tramo con marcas en alertas.
 * Etiqueta #registro + tipo alineada izq/centro/der según el tercio del tramo.
 */
function estiloAlertaSegmento(s) {
  if (s.solapa || s.alertaSolape) {
    return { color: '#b91c1c', tag: 'Solape' }
  }
  if (s.alertaVacio) {
    return { color: '#b45309', tag: 'Vacío' }
  }
  if (s.alertaEspesor) {
    return { color: '#6d28d9', tag: 'Esp.≠' }
  }
  return { color: '#334155', tag: 'Alerta' }
}

function tercioAbs(pct) {
  if (pct < 100 / 3) return 'izq'
  if (pct > (200 / 3)) return 'der'
  return 'cen'
}

function FranjaCoberturaGrupo({ grupo, t, seleccionadoId, onSelectSegmento }) {
  const segs = grupo.segmentos || []
  if (!segs.length) return null

  let min = grupo.minAbs
  let max = grupo.maxAbs
  if (min == null || max == null || !(max > min)) {
    const vals = segs.flatMap((s) => [s.absInicio, s.absFin]).filter((n) => Number.isFinite(n))
    if (!vals.length) return null
    min = Math.min(...vals)
    max = Math.max(...vals)
  }
  const span = max > min ? max - min : 1
  const toPct = (abs) => ((abs - min) / span) * 100

  const marks = segs.map((s) => {
    const a0 = Math.min(s.absInicio, s.absFin)
    const a1 = Math.max(s.absInicio, s.absFin)
    const mid = (a0 + a1) / 2
    const pct = Math.min(100, Math.max(0, toPct(mid)))
    return { ...s, a0, a1, mid, pct, tercio: tercioAbs(pct) }
  })

  const porTercio = { izq: [], cen: [], der: [] }
  for (const m of marks) porTercio[m.tercio].push(m)

  const renderEtiqueta = (m) => {
    const sel = String(seleccionadoId) === String(m.id)
    const st = estiloAlertaSegmento(m)
    const label = `#${m.numero_registro ?? m.id} ${st.tag}`
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => onSelectSegmento?.(m.id)}
        title={`${label} · Abs ${fmtNum(m.a0, 3)}–${fmtNum(m.a1, 3)}`}
        style={{
          whiteSpace: 'nowrap',
          background: sel ? `${t.primary || '#0284c7'}18` : 'transparent',
          border: sel ? `1px solid ${t.primary || '#0284c7'}` : '1px solid transparent',
          borderRadius: 4,
          padding: '0 4px',
          height: 16,
          lineHeight: '16px',
          fontSize: 11,
          fontWeight: 800,
          color: st.color,
          cursor: 'pointer',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.text }}>{grupo.label}</span>
        <span style={{ fontSize: 11, color: t.textMuted }}>
          Abs {fmtNum(min, 1)} → {fmtNum(max, 1)} · {segs.length} alerta{segs.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Etiquetas: izq / centro / der según tercio del tramo */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 4,
          minHeight: 16,
          marginBottom: 2,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'flex-start', justifyContent: 'flex-start' }}>
          {porTercio.izq.map(renderEtiqueta)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignContent: 'flex-start', justifyContent: 'center' }}>
          {porTercio.cen.map(renderEtiqueta)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignContent: 'flex-start', justifyContent: 'flex-end' }}>
          {porTercio.der.map(renderEtiqueta)}
        </div>
      </div>

      {/* Eje Abs delgado + marcas de corte en posición real */}
      <div style={{ position: 'relative', height: 12 }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 5,
            height: 2,
            borderRadius: 1,
            background: t.border || '#94a3b8',
          }}
        />
        <div style={{ position: 'absolute', left: 0, top: 2, width: 2, height: 8, background: t.border || '#94a3b8', borderRadius: 1 }} />
        <div style={{ position: 'absolute', right: 0, top: 2, width: 2, height: 8, background: t.border || '#94a3b8', borderRadius: 1 }} />

        {marks.map((m) => {
          const sel = String(seleccionadoId) === String(m.id)
          const st = estiloAlertaSegmento(m)
          return (
            <button
              key={`tick-${m.id}`}
              type="button"
              aria-label={`Marca #${m.numero_registro ?? m.id}`}
              onClick={() => onSelectSegmento?.(m.id)}
              title={`Abs ${fmtNum(m.a0, 3)}–${fmtNum(m.a1, 3)}`}
              style={{
                position: 'absolute',
                left: `${m.pct}%`,
                top: 1,
                width: 8,
                height: 10,
                marginLeft: -4,
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  display: 'block',
                  width: 2,
                  height: 10,
                  margin: '0 auto',
                  borderRadius: 1,
                  background: sel ? (t.primary || '#0284c7') : st.color,
                }}
              />
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
  const filaRefs = useRef(new Map())

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

  const gruposFranja = useMemo(
    () => (analisis ? gruposFranjaSoloAlertas(analisis.filas, analisis.grupos) : []),
    [analisis],
  )

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

  const seleccionar = (id, { scroll = true } = {}) => {
    setSeleccionadoId(id)
    // Resaltado local solamente — no notificar al padre para no sobrescribir filtros.
    if (scroll) {
      requestAnimationFrame(() => {
        const el = filaRefs.current.get(String(id))
        if (el?.scrollIntoView) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      })
    }
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

      {modo === 'analisis' && gruposFranja.length > 0 && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: '8px 12px' }}>
          <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 800, color: t.text, marginBottom: 4 }}>
            A revisar — posición en el tramo (solo alertas)
          </div>
          {gruposFranja.map((g) => (
            <FranjaCoberturaGrupo
              key={g.key}
              grupo={g}
              t={t}
              seleccionadoId={seleccionadoId}
              onSelectSegmento={seleccionar}
            />
          ))}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2, fontSize: 11, color: t.textMuted, alignItems: 'center' }}>
            <span style={{ color: '#b91c1c', fontWeight: 700 }}>Solape</span>
            <span style={{ color: '#b45309', fontWeight: 700 }}>Vacío</span>
            <span style={{ color: '#6d28d9', fontWeight: 700 }}>Espesor</span>
            <span>Etiqueta izq/centro/der según tercio del tramo · clic → fila</span>
          </div>
        </div>
      )}

      {modo === 'analisis' && analisis && gruposFranja.length === 0 && (
        <div
          style={{
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 'var(--cc-sm)',
            color: t.textMuted,
          }}
        >
          Sin alertas de solape, vacío ni espesor atípico para este ítem — la franja no muestra segmentos.
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
                  const bg = sel
                    ? `${t.primary}18`
                    : modo === 'analisis' && reg._alertaSolape
                      ? 'rgba(220,38,38,0.10)'
                      : modo === 'analisis' && reg._alertaVacioAntes
                        ? 'rgba(217,119,6,0.10)'
                        : modo === 'analisis' && reg._alertaEspesorAtipico
                          ? 'rgba(124,58,237,0.08)'
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
                      ref={(el) => {
                        if (el) filaRefs.current.set(String(reg.id), el)
                        else filaRefs.current.delete(String(reg.id))
                      }}
                      onClick={() => seleccionar(reg.id, { scroll: false })}
                      style={{
                        background: sel ? `${t.primary}22` : bg,
                        cursor: 'pointer',
                        borderBottom: `1px solid ${t.border}33`,
                        outline: sel ? `2px solid ${t.primary}` : 'none',
                        outlineOffset: -2,
                      }}
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
