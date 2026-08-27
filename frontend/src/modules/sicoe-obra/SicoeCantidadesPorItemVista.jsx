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
 * Etiqueta = chip relleno; #registro dominante; tipo secundario; izq/cen/der por tercio.
 */
function estiloAlertaSegmento(s) {
  if (s.solapa || s.alertaSolape) {
    return { background: '#fecaca', color: '#7f1d1d', tick: '#dc2626', tag: 'Solape' }
  }
  if (s.alertaVacio) {
    return { background: '#fde68a', color: '#92400e', tick: '#d97706', tag: 'Vacío' }
  }
  if (s.alertaEspesor) {
    return { background: '#ddd6fe', color: '#5b21b6', tick: '#7c3aed', tag: 'Espesor' }
  }
  return { background: '#cbd5e1', color: '#1e293b', tick: '#475569', tag: 'Alerta' }
}

/** Tercio del tramo (0–100 %) → alineación de etiqueta respecto a su marca. */
function tercioAbs(pct) {
  if (pct < 100 / 3) return 'izq'
  if (pct > 200 / 3) return 'der'
  return 'cen'
}

/** Divisor de celda tipo Excel (mismo criterio que Ítems/registros). */
const SHEET_CELL_BORDER = '#94a3b8'

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

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 1,
          flexWrap: 'wrap',
          alignItems: 'baseline',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: t.text }}>{grupo.label}</span>
        <span style={{ fontSize: 10, color: t.textMuted }}>
          {fmtNum(min, 1)} → {fmtNum(max, 1)} · {segs.length}
        </span>
      </div>

      {/* Chips rellenos junto a su marca + eje Abs delgado */}
      <div style={{ position: 'relative', height: 32, paddingTop: 16 }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 22,
            height: 2,
            borderRadius: 1,
            background: t.border || '#94a3b8',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 19,
            width: 2,
            height: 8,
            background: t.border || '#94a3b8',
            borderRadius: 1,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 19,
            width: 2,
            height: 8,
            background: t.border || '#94a3b8',
            borderRadius: 1,
          }}
        />

        {marks.map((m) => {
          const sel = String(seleccionadoId) === String(m.id)
          const st = estiloAlertaSegmento(m)
          const num = `#${m.numero_registro ?? m.id}`
          const title = `${num} ${st.tag} · Abs ${fmtNum(m.a0, 3)}–${fmtNum(m.a1, 3)}`
          // izq → a la izquierda de la marca; cen → centrada; der → a la derecha
          const transform =
            m.tercio === 'izq'
              ? 'translateX(-100%)'
              : m.tercio === 'der'
                ? 'translateX(0)'
                : 'translateX(-50%)'
          return (
            <div
              key={m.id}
              style={{
                position: 'absolute',
                left: `${m.pct}%`,
                top: 0,
                bottom: 0,
                width: 0,
                zIndex: sel ? 2 : 1,
              }}
            >
              <button
                type="button"
                onClick={() => onSelectSegmento?.(m.id)}
                title={title}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  transform,
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  gap: 4,
                  whiteSpace: 'nowrap',
                  background: st.background,
                  border: sel ? `2px solid ${t.primary || '#0284c7'}` : '1px solid transparent',
                  borderRadius: 6,
                  padding: '1px 7px 2px',
                  height: 18,
                  lineHeight: 1,
                  cursor: 'pointer',
                  boxShadow: sel
                    ? `0 0 0 2px ${(t.primary || '#0284c7')}33`
                    : '0 1px 2px rgba(15,23,42,0.08)',
                  maxWidth: 120,
                  overflow: 'hidden',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 900, color: st.color, letterSpacing: '-0.01em' }}>
                  {num}
                </span>
                <span style={{ fontSize: 9, fontWeight: 600, color: st.color, opacity: 0.75 }}>
                  {st.tag}
                </span>
              </button>
              <button
                type="button"
                aria-label={title}
                onClick={() => onSelectSegmento?.(m.id)}
                title={title}
                style={{
                  position: 'absolute',
                  left: -4,
                  top: 16,
                  width: 8,
                  height: 14,
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
                    height: 12,
                    margin: '0 auto',
                    borderRadius: 1,
                    background: sel ? t.primary || '#0284c7' : st.tick,
                  }}
                />
              </button>
            </div>
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

  const sheetGrid = t.sheetGridBorder || SHEET_CELL_BORDER
  const sheetTh = {
    padding: '7px 8px',
    fontSize: 11,
    fontWeight: 800,
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
    border: `1px solid ${sheetGrid}`,
    background: t.headerBg || t.bg,
    position: 'sticky',
    top: 0,
    zIndex: 2,
  }
  const sheetTd = {
    padding: '6px 8px',
    fontSize: 'var(--cc-sm)',
    color: t.text,
    border: `1px solid ${sheetGrid}`,
    verticalAlign: 'middle',
    lineHeight: 1.25,
  }

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
          Por cantidades
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
          Defina criterios en <strong style={{ color: t.text }}>Filtros</strong> y pulse <strong style={{ color: t.text }}>Buscar</strong> para ver por cantidades.
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
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: '6px 10px 4px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: t.text, marginBottom: 2 }}>
            A revisar — eje Abs del tramo (solo alertas)
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
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 0, fontSize: 10, color: t.textMuted, alignItems: 'center' }}>
            <span style={{ background: '#fecaca', color: '#7f1d1d', fontWeight: 800, padding: '1px 6px', borderRadius: 4 }}>Solape</span>
            <span style={{ background: '#fde68a', color: '#92400e', fontWeight: 800, padding: '1px 6px', borderRadius: 4 }}>Vacío</span>
            <span style={{ background: '#ddd6fe', color: '#5b21b6', fontWeight: 800, padding: '1px 6px', borderRadius: 4 }}>Espesor</span>
            <span>Chip relleno · # registro destacado · clic → fila</span>
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
        <div style={{ background: t.bgCard, border: `1px solid ${sheetGrid}`, borderRadius: 4, overflow: 'auto' }}>
          <table
            className="cc-sicoe-items-sheet"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', minWidth: verEco ? 1380 : 1180 }}
          >
            <thead>
              <tr>
                {headers.map((h) => (
                  <th
                    key={h}
                    style={{
                      ...sheetTh,
                      textAlign: ['Observación', 'Tramo', 'Infraestructura', 'Capítulo', 'Ítem', 'Alertas'].includes(h) ? 'left' : 'right',
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
                  <td colSpan={headers.length || colCount} style={{ ...sheetTd, padding: 24, textAlign: 'center', color: t.textMuted }}>
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
                  const td = { ...sheetTd, background: sel ? `${t.primary}22` : bg }
                  return (
                    <tr
                      key={reg.id}
                      ref={(el) => {
                        if (el) filaRefs.current.set(String(reg.id), el)
                        else filaRefs.current.delete(String(reg.id))
                      }}
                      onClick={() => seleccionar(reg.id, { scroll: false })}
                      style={{
                        cursor: 'pointer',
                        outline: sel ? `2px solid ${t.primary}` : 'none',
                        outlineOffset: -2,
                      }}
                    >
                      {modo === 'analisis' && (
                        <td style={{ ...td, textAlign: 'left', whiteSpace: 'nowrap' }}>
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
                      <td style={{ ...td, textAlign: 'right', color: t.primary, fontWeight: 700 }}>
                        #{reg.numero_reporte ?? '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>#{reg.numero_registro ?? '—'}</td>
                      {modo === 'general' && (
                        <>
                          <td style={{ ...td, textAlign: 'left' }}>{reg.capitulo || '—'}</td>
                          <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{reg.item_numero || '—'}</td>
                        </>
                      )}
                      <td style={{ ...td, textAlign: 'left', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={reg.tramo || ''}>{reg.tramo || '—'}</td>
                      <td style={{ ...td, textAlign: 'left', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={reg.infraestructura || ''}>{reg.infraestructura || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'ui-monospace, Consolas, monospace' }}>{fmtNum(reg.abs_inicio, 3)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'ui-monospace, Consolas, monospace' }}>{fmtNum(reg.abs_final, 3)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtNum(reg.longitud)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtNum(reg.ancho)}</td>
                      <td
                        style={{
                          ...td,
                          textAlign: 'right',
                          fontWeight: reg._alertaEspesorAtipico ? 800 : 400,
                          color: reg._alertaEspesorAtipico ? '#7c3aed' : t.text,
                        }}
                      >
                        {fmtNum(reg.espesor, 3)}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtNum(reg.cantidad)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtNum(reg.cantidad_total)}</td>
                      {verEco && (
                        <td style={{ ...td, textAlign: 'right', color: t.primary, fontWeight: 700 }}>{fmtPesos(cd)}</td>
                      )}
                      <td style={{ ...td, textAlign: 'left', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={reg.observacion || ''}>
                        {reg.observacion || '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
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
                      <td style={{ ...td, textAlign: 'center' }}>
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
                      <td style={{ ...td, textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
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
            <div style={{ padding: '8px 12px', fontSize: 'var(--cc-caption)', color: t.textMuted, borderTop: `1px solid ${sheetGrid}` }}>
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
