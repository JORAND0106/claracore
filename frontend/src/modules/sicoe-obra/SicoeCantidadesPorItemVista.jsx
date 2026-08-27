import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  analizarCantidadesPorItem,
  costoDirectoDesdeListado,
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

/** Franja horizontal Abs Inicio–Fin por grupo Tramo+Infraestructura. */
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

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.text }}>{grupo.label}</span>
        <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
          Abs {fmtNum(min, 3)} → {fmtNum(max, 3)}
          {grupo.solapes ? ` · ${grupo.solapes} solape(s)` : ''}
          {grupo.vacios ? ` · ${grupo.vacios} vacío(s)` : ''}
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          height: 28,
          borderRadius: 6,
          background: t.bg || '#f1f5f9',
          border: `1px solid ${t.border}`,
          overflow: 'hidden',
        }}
        title={`Rango ${fmtNum(min, 3)} – ${fmtNum(max, 3)}`}
      >
        {vacios.map((v, i) => (
          <div
            key={`v-${i}`}
            title={`Vacío ${fmtNum(v.desde, 3)} → ${fmtNum(v.hasta, 3)} (${fmtNum(v.brecha, 3)} m)`}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${toPct(v.desde)}%`,
              width: `${Math.max(0.4, toPct(v.hasta) - toPct(v.desde))}%`,
              background: 'repeating-linear-gradient(135deg,#fde68a 0 4px,#fffbeb 4px 8px)',
              borderLeft: '1px solid #f59e0b',
              borderRight: '1px solid #f59e0b',
            }}
          />
        ))}
        {grupo.segmentos.map((s) => {
          const left = toPct(Math.min(s.absInicio, s.absFin))
          const width = Math.max(0.5, toPct(Math.max(s.absInicio, s.absFin)) - left)
          const solapa = grupo.segmentos.some(
            (o) =>
              o.id !== s.id &&
              Math.min(s.absInicio, s.absFin) < Math.max(o.absInicio, o.absFin) &&
              Math.max(s.absInicio, s.absFin) > Math.min(o.absInicio, o.absFin),
          )
          const sel = String(seleccionadoId) === String(s.id)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectSegmento?.(s.id)}
              title={`Reg #${s.numero_registro ?? s.id} · ${fmtNum(s.absInicio, 3)}–${fmtNum(s.absFin, 3)}${solapa ? ' · SOLAPE' : ''}`}
              style={{
                position: 'absolute',
                top: solapa ? 2 : 6,
                height: solapa ? 24 : 16,
                left: `${left}%`,
                width: `${width}%`,
                border: sel ? '2px solid #0f172a' : '1px solid rgba(15,23,42,0.25)',
                borderRadius: 3,
                background: solapa ? 'rgba(220,38,38,0.72)' : 'rgba(14,165,233,0.65)',
                cursor: 'pointer',
                padding: 0,
                zIndex: solapa ? 2 : 1,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

/**
 * Vista módulo: Cantidades por Ítem con detección de solapes/vacíos/espesores.
 * No altera Portada / Sin asignar / TAB3 — es una vista paralela a la grilla de reportes.
 */
export default function SicoeCantidadesPorItemVista({
  t,
  contratoId,
  token,
  API_URL,
  nivelInfo,
  nivelesContrato,
  filtroCapList = [],
  capituloInicial = '',
  itemInicial = '',
  onAbrirRegistro,
  onSeleccionCambio,
  onValidarRapido,
  ejecutandoValidacion = false,
  refreshNonce = 0,
}) {
  const [capitulo, setCapitulo] = useState(capituloInicial || '')
  const [itemDraft, setItemDraft] = useState(itemInicial || '')
  const [itemActivo, setItemActivo] = useState(itemInicial || '')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [payload, setPayload] = useState(null)
  const [seleccionadoId, setSeleccionadoId] = useState(null)
  const [itemsSugeridos, setItemsSugeridos] = useState([])

  useEffect(() => {
    if (capituloInicial) setCapitulo(capituloInicial)
    if (itemInicial) {
      setItemDraft(itemInicial)
      setItemActivo(itemInicial)
    }
  }, [capituloInicial, itemInicial])

  const cargar = useCallback(async (cap, it) => {
    const c = String(cap || '').trim()
    const i = String(it || '').trim()
    if (!contratoId || !c || !i || !token) return
    setCargando(true)
    setError(null)
    try {
      const params = new URLSearchParams({ capitulo: c, item: i })
      const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/cantidades-por-item?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.detail || `Error ${res.status}`)
      setPayload(data)
      setItemActivo(i)
      setCapitulo(c)
    } catch (e) {
      setPayload(null)
      setError(e?.message || String(e))
    } finally {
      setCargando(false)
    }
  }, [API_URL, contratoId, token])

  useEffect(() => {
    if (capituloInicial && itemInicial) void cargar(capituloInicial, itemInicial)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — solo al montar con iniciales

  useEffect(() => {
    if (!refreshNonce) return
    const c = String(capitulo || capituloInicial || '').trim()
    const i = String(itemActivo || itemInicial || '').trim()
    if (c && i) void cargar(c, i)
  }, [refreshNonce]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!contratoId || !token || !capitulo) {
      setItemsSugeridos([])
      return undefined
    }
    const ac = new AbortController()
    const q = encodeURIComponent(itemDraft || '')
    const cap = encodeURIComponent(capitulo)
    fetch(`${API_URL}/sicoe-obra/${contratoId}/filtros/items?capitulo=${cap}&q=${q}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ac.signal,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : (rows?.items || [])
        setItemsSugeridos(list.slice(0, 40))
      })
      .catch(() => {})
    return () => ac.abort()
  }, [API_URL, contratoId, token, capitulo, itemDraft])

  const analisis = useMemo(
    () => analizarCantidadesPorItem(payload?.registros || []),
    [payload],
  )

  const nvUsuario = Number(nivelInfo?.nivelValidacion) || null
  const verEco = !!nivelInfo?.verValoresEconomicos && !payload?.ocultar_costo_directo
  const nivelesActivos = Array.isArray(nivelesContrato?.niveles_activos)
    ? nivelesContrato.niveles_activos
    : [1, 2, 3]

  const seleccionar = (id) => {
    setSeleccionadoId(id)
    const fila = analisis.filas.find((f) => String(f.id) === String(id))
    onSeleccionCambio?.(fila || null, {
      capitulo: payload?.capitulo || capitulo,
      item: payload?.item || itemActivo,
    })
  }

  const puedeValidarFila = (reg) =>
    !!nivelInfo?.puedeValidar &&
    nvUsuario >= 1 &&
    nvUsuario <= 6 &&
    !reg?.bloqueado &&
    !!String(reg?.item_numero || '').trim()

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
        <div style={{ fontSize: 'var(--cc-md)', fontWeight: 800, color: t.text, marginBottom: 8 }}>
          Cantidades por ítem · control de solapes / vacíos / espesores
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
            <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Capítulo</span>
            <select
              value={capitulo}
              onChange={(e) => setCapitulo(e.target.value)}
              style={{
                background: t.bg,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: '8px 10px',
                color: t.text,
                fontSize: 'var(--cc-sm)',
              }}
            >
              <option value="">Seleccione…</option>
              {(filtroCapList || []).map((c) => {
                const v = typeof c === 'string' ? c : (c?.capitulo || c?.label || '')
                return (
                  <option key={v} value={v}>{v}</option>
                )
              })}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px' }}>
            <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Ítem</span>
            <input
              list="sicoe-cpi-items"
              value={itemDraft}
              onChange={(e) => setItemDraft(e.target.value)}
              placeholder="Ej. 2.1.3"
              style={{
                background: t.bg,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: '8px 10px',
                color: t.text,
                fontSize: 'var(--cc-sm)',
              }}
            />
            <datalist id="sicoe-cpi-items">
              {itemsSugeridos.map((it) => {
                const code = typeof it === 'string' ? it : (it?.item_numero || it?.item || '')
                const desc = typeof it === 'object' ? (it?.descripcion || it?.item_descripcion || '') : ''
                return <option key={code} value={code}>{desc ? `${code} — ${desc}` : code}</option>
              })}
            </datalist>
          </label>
          <button
            type="button"
            disabled={!capitulo || !itemDraft.trim() || cargando}
            onClick={() => void cargar(capitulo, itemDraft)}
            style={{
              background: t.primary,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '9px 16px',
              fontWeight: 800,
              fontSize: 'var(--cc-sm)',
              cursor: !capitulo || !itemDraft.trim() || cargando ? 'not-allowed' : 'pointer',
              opacity: !capitulo || !itemDraft.trim() || cargando ? 0.55 : 1,
            }}
          >
            {cargando ? 'Cargando…' : 'Consultar'}
          </button>
        </div>
        {payload && (
          <div style={{ marginTop: 10, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            <strong style={{ color: t.text }}>{payload.item}</strong>
            {payload.item_descripcion ? ` · ${payload.item_descripcion}` : ''}
            {payload.unidad ? ` · ${payload.unidad}` : ''}
            {verEco && payload.vlr_unitario_listado
              ? ` · VU listado ${fmtPesos(payload.vlr_unitario_listado)}`
              : ''}
            {` · ${payload.total ?? 0} registro(s)`}
          </div>
        )}
        {error && (
          <div style={{ marginTop: 8, color: '#b91c1c', fontSize: 'var(--cc-sm)', fontWeight: 600 }}>{error}</div>
        )}
      </div>

      {payload && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: t.bgCard,
            border: `1px solid ${t.border}`,
          }}
        >
          <ResumenChip
            label="Solapes"
            value={analisis.resumen.solapes}
            color="#dc2626"
            title="Registros cuyo Abs Inicio invade el Abs Fin del anterior (mismo Tramo+Infraestructura)"
          />
          <ResumenChip
            label="Vacíos"
            value={analisis.resumen.vacios}
            color="#d97706"
            title="Brechas entre Abs Fin y Abs Inicio del siguiente (posible tramo sin cobrar)"
          />
          <ResumenChip
            label="Espesores atípicos"
            value={analisis.resumen.espesoresAtipicos}
            color="#7c3aed"
            title="Espesor distinto a la moda del grupo Capítulo+Ítem+Tramo+Infraestructura"
          />
          <ResumenChip
            label="Registros"
            value={analisis.resumen.total}
            color={t.primary}
            title="Total de líneas del ítem en el contrato"
          />
        </div>
      )}

      {payload && analisis.grupos.length > 0 && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: t.text, marginBottom: 8 }}>
            Franja de cobertura (abscisas por Tramo · Infraestructura)
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
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 'var(--cc-caption)', color: t.textMuted }}>
            <span><span style={{ display: 'inline-block', width: 12, height: 10, background: 'rgba(14,165,233,0.65)', borderRadius: 2, marginRight: 4 }} />Cubierto</span>
            <span><span style={{ display: 'inline-block', width: 12, height: 10, background: 'rgba(220,38,38,0.72)', borderRadius: 2, marginRight: 4 }} />Solape</span>
            <span><span style={{ display: 'inline-block', width: 12, height: 10, background: '#fde68a', borderRadius: 2, marginRight: 4 }} />Vacío</span>
          </div>
        </div>
      )}

      {payload && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'auto' }}>
          <table className="cc-sicoe-panel-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', minWidth: verEco ? 1280 : 1100 }}>
            <thead>
              <tr style={{ background: t.bg, color: t.textMuted, fontSize: 'var(--cc-caption)', fontWeight: 800 }}>
                {['Alertas', 'Reporte', 'Reg.', 'Tramo', 'Infraestructura', 'Abs Inicio', 'Abs Fin', 'Long', 'Ancho', 'Espesor', 'Cant. Total', ...(verEco ? ['Costo Directo'] : []), 'Observación', 'Foto', 'Gráfico', 'Validación'].map((h) => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Observación' || h === 'Tramo' || h === 'Infraestructura' ? 'left' : 'right', borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analisis.filas.length === 0 ? (
                <tr>
                  <td colSpan={verEco ? 16 : 15} style={{ padding: 24, textAlign: 'center', color: t.textMuted }}>
                    No hay registros con ítem asignado para esta consulta.
                  </td>
                </tr>
              ) : (
                analisis.filas.map((reg) => {
                  const sel = String(seleccionadoId) === String(reg.id)
                  const bg = reg._alertaSolape
                    ? 'rgba(220,38,38,0.10)'
                    : reg._alertaVacioAntes
                      ? 'rgba(217,119,6,0.10)'
                      : reg._alertaEspesorAtipico
                        ? 'rgba(124,58,237,0.08)'
                        : sel
                          ? `${t.primary}14`
                          : 'transparent'
                  const cd = verEco
                    ? (reg.costo_directo_calc ?? costoDirectoDesdeListado(reg.cantidad_total, payload.vlr_unitario_listado))
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
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: t.primary, fontWeight: 700 }}>
                        #{reg.numero_reporte ?? '—'}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>#{reg.numero_registro ?? '—'}</td>
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
              Validación rápida usa su nivel N{nvUsuario}. Para Pendiente/Rechazado u otros niveles, abra el registro en la carpeta.
              Costo directo = cantidad × VU de listado de precios (no el valor congelado de la fila).
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ResumenChip({ label, value, color, title }) {
  return (
    <div
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 999,
        border: `1px solid ${color}55`,
        background: `${color}14`,
      }}
    >
      <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color }}>{label}</span>
      <strong style={{ fontSize: 'var(--cc-md)', color, fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
    </div>
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
