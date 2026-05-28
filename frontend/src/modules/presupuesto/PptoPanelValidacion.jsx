import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatCOP } from '../../utils/formatCOP'
import {
  PPTO_PANEL_ESTADOS,
  pptoPanelAgruparValidacion,
  pptoPanelAvanceGlobal,
  pptoPanelTotalesFilas,
} from './pptoPanelValidacionAgg'

/** Anillo compacto: % validado (registros fuera de «No Revisado»). */
function IndicadorAvance({ pct = 0, pendientes = 0, size = 'md', title: titleExtra }) {
  const p = Math.min(100, Math.max(0, Math.round(pct)))
  const tone = p >= 100 ? '#10B981' : p > 0 ? '#EAB308' : '#3B82F6'
  const dim = size === 'sm' ? 22 : 30
  const inner = size === 'sm' ? 16 : 22
  const font = size === 'sm' ? 7 : 9
  const tip =
    titleExtra ||
    (p >= 100
      ? 'Validación completa en esta fila'
      : `${p}% revisado · ${pendientes.toLocaleString('es-CO')} reg. sin revisar`)

  return (
    <div
      title={tip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size === 'sm' ? 4 : 6,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: dim,
          height: dim,
          borderRadius: '50%',
          background: `conic-gradient(${tone} ${p * 3.6}deg, color-mix(in srgb, var(--ppto-panel-muted) 22%, transparent) 0)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: p < 100 && pendientes > 0 ? `0 0 0 1px color-mix(in srgb, ${tone} 35%, transparent)` : 'none',
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            borderRadius: '50%',
            background: 'var(--ppto-panel-row, var(--ppto-panel-body))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: font,
            fontWeight: 800,
            color: 'var(--ppto-panel-text)',
            lineHeight: 1,
          }}
        >
          {p}
        </div>
      </div>
      {size !== 'sm' && (
        <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: tone, minWidth: 28 }}>{p}%</span>
      )}
    </div>
  )
}

function truncarTexto(s, max = 56) {
  const t = String(s || '').trim()
  if (!t || t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function CeldaEstado({ celda, verCostos, fmt, color, mutedColor, textColor }) {
  if (!celda || celda.count === 0) {
    return <span style={{ color: mutedColor, fontSize: 'var(--cc-caption)' }}>—</span>
  }
  return (
    <span style={{ fontSize: 'var(--cc-caption)', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
      <span style={{ fontWeight: 700, color: textColor }}>{celda.count.toLocaleString('es-CO')} reg.</span>
      {verCostos && (
        <>
          <span style={{ color: mutedColor, margin: '0 4px' }}>|</span>
          <span style={{ fontWeight: 600, color }}>{fmt(celda.costo)}</span>
        </>
      )}
    </span>
  )
}

/**
 * Panel dinámico — validación Interventoría por capítulo / ítem.
 * Colores alineados con el tema activo (t.*), no slate fijo.
 */
export default function PptoPanelValidacion({
  t,
  registrosFiltrados = [],
  registrosBusqueda = [],
  /** Filas pre-agregadas del servidor (GET panel-validacion-interv); prioridad sobre registros locales. */
  filasServidor = null,
  capitulosResumen = [],
  verValoresEconomicos = true,
  busquedaActiva = false,
  busquedaSeq = 0,
  puedeBuscar = true,
  cargando = false,
  autoCapitulo = '',
  onBuscar,
  onLimpiarTodo,
  onVolverCapitulos,
  onDrillCapitulo,
  onAplicarCapitulos,
  onAplicarItems,
  onFiltrarEstadoCelda,
  listadoPrecios = [],
}) {
  const fmt = (n) => (verValoresEconomicos ? formatCOP(n) : '—')
  const [expandido, setExpandido] = useState(false)
  const [nivel, setNivel] = useState('capitulo')
  const [capSel, setCapSel] = useState(null)
  const [checks, setChecks] = useState(() => new Set())
  const [checksAplicados, setChecksAplicados] = useState(() => new Set())
  const checksRef = useRef(checks)
  /** Evita que autoCapitulo vuelva a forzar ítems tras pulsar «Atrás». */
  const navegacionManualRef = useRef(null)

  const panelCss = useMemo(() => {
    const base = t.bgCard
    const chrome = t.inputBg || t.bg
    return {
      '--ppto-panel-header': `color-mix(in srgb, ${t.text} 12%, color-mix(in srgb, ${t.primary} 16%, ${chrome}))`,
      '--ppto-panel-thead': `color-mix(in srgb, ${t.text} 9%, color-mix(in srgb, ${t.primary} 11%, ${base}))`,
      '--ppto-panel-footer': `color-mix(in srgb, ${t.text} 11%, color-mix(in srgb, ${t.primary} 14%, ${chrome}))`,
      '--ppto-panel-body': `color-mix(in srgb, ${t.border} 12%, ${base})`,
      '--ppto-panel-row': `color-mix(in srgb, ${t.border} 34%, ${base})`,
      '--ppto-panel-text': t.text,
      '--ppto-panel-muted': t.textMuted,
      '--ppto-panel-border': t.border,
      '--ppto-panel-outline': `color-mix(in srgb, ${t.text} 28%, ${t.border})`,
      '--ppto-panel-accent': t.primary,
    }
  }, [t])

  const shellStyle = useMemo(
    () => ({
      ...panelCss,
      background: 'var(--ppto-panel-body)',
      border: '2px solid var(--ppto-panel-outline)',
      borderRadius: 12,
      marginBottom: 12,
      overflow: 'hidden',
      boxShadow: `0 1px 0 color-mix(in srgb, var(--ppto-panel-text) 6%, transparent), ${t.shadow || '0 2px 8px rgba(0,0,0,0.06)'}`,
    }),
    [panelCss, t.shadow],
  )

  /** Vista capítulos: todos los registros de la última búsqueda (sin drill de grilla). Vista ítems: solo el capítulo elegido. */
  const registrosPanel = useMemo(() => {
    const base = registrosBusqueda?.length ? registrosBusqueda : registrosFiltrados
    if (nivel === 'item' && capSel) {
      const cap = String(capSel).trim()
      return base.filter((r) => String(r.capitulo ?? '').trim() === cap)
    }
    return base
  }, [registrosBusqueda, registrosFiltrados, nivel, capSel])

  const itemDescMap = useMemo(() => {
    const m = {}
    for (const p of listadoPrecios || []) {
      const n = String(p.item_numero ?? '').trim()
      if (!n) continue
      const d = String(p.descripcion ?? '').trim()
      if (d) m[n] = d
    }
    return m
  }, [listadoPrecios])

  const filas = useMemo(() => {
    if (filasServidor != null && Array.isArray(filasServidor)) {
      return filasServidor
    }
    return pptoPanelAgruparValidacion(
      registrosPanel,
      nivel,
      nivel === 'item' ? capSel : null,
      capitulosResumen,
    )
  }, [filasServidor, registrosPanel, nivel, capSel, capitulosResumen])

  const totales = useMemo(() => pptoPanelTotalesFilas(filas), [filas])
  const avanceGlobal = useMemo(() => pptoPanelAvanceGlobal(filas), [filas])
  const labels = useMemo(() => filas.map((g) => g.label), [filas])

  useEffect(() => {
    checksRef.current = checks
  }, [checks])

  useEffect(() => {
    if (!busquedaActiva || cargando) return
    const next = new Set(labels)
    setChecks(next)
    checksRef.current = next
    setChecksAplicados(new Set())
  }, [busquedaActiva, cargando, nivel, capSel, labels.join('\x1f')])

  useEffect(() => {
    navegacionManualRef.current = null
  }, [busquedaSeq])

  useEffect(() => {
    if (!busquedaActiva) {
      navegacionManualRef.current = null
      setNivel('capitulo')
      setCapSel(null)
      return
    }
    if (cargando) return
    if (navegacionManualRef.current === 'capitulo') {
      setCapSel(null)
      setNivel('capitulo')
      return
    }
    if (navegacionManualRef.current === 'item') {
      setNivel('item')
      return
    }
    if (autoCapitulo) {
      setCapSel(autoCapitulo)
      setNivel('item')
    } else {
      setCapSel(null)
      setNivel('capitulo')
    }
  }, [busquedaActiva, cargando, autoCapitulo])

  const checksPendientes = useMemo(() => {
    if (labels.length === 0) return false
    if (checks.size !== checksAplicados.size) return true
    for (const l of checks) if (!checksAplicados.has(l)) return true
    return false
  }, [checks, checksAplicados, labels])

  const toggleCheck = (label, on) => {
    setChecks((prev) => {
      const n = new Set(prev)
      if (on) n.add(label)
      else n.delete(label)
      checksRef.current = n
      return n
    })
  }

  const toggleTodos = (marcar) => {
    const n = marcar ? new Set(labels) : new Set()
    setChecks(n)
    checksRef.current = n
  }

  const irCapituloItems = (g) => {
    navegacionManualRef.current = 'item'
    setCapSel(g.capitulo)
    setNivel('item')
    onDrillCapitulo?.(g.capitulo)
  }

  const volverCapitulos = () => {
    navegacionManualRef.current = 'capitulo'
    setNivel('capitulo')
    setCapSel(null)
    onVolverCapitulos?.()
  }

  const aplicarDesdeChecks = useCallback(() => {
    const sel = checksRef.current
    const todos = labels.length > 0 && labels.every((l) => sel.has(l))
    const eff = todos ? [] : [...sel]
    if (nivel === 'capitulo') {
      onAplicarCapitulos?.(eff)
    } else {
      const items = eff
        .map((label) => {
          const g = filas.find((x) => x.label === label)
          return g?.item || label
        })
        .filter(Boolean)
      onAplicarItems?.(capSel, items)
    }
    setChecksAplicados(new Set(sel))
  }, [nivel, capSel, labels, filas, onAplicarCapitulos, onAplicarItems])

  const th = {
    padding: '4px 8px',
    fontSize: 'var(--cc-caption)',
    fontWeight: 700,
    color: 'var(--ppto-panel-text)',
    background: 'var(--ppto-panel-thead)',
    borderBottom: '1px solid var(--ppto-panel-outline)',
    whiteSpace: 'nowrap',
  }

  const btnAtras = {
    background: `color-mix(in srgb, var(--ppto-panel-accent) 12%, var(--ppto-panel-header))`,
    border: '1px solid var(--ppto-panel-outline)',
    borderRadius: 6,
    padding: '4px 12px',
    fontSize: 'var(--cc-label)',
    fontWeight: 700,
    color: 'var(--ppto-panel-text)',
    cursor: 'pointer',
  }

  const btnBuscar = {
    background: puedeBuscar && !cargando ? 'var(--ppto-panel-accent)' : 'var(--ppto-panel-border)',
    border: 'none',
    borderRadius: 6,
    padding: '5px 14px',
    fontSize: 'var(--cc-caption)',
    fontWeight: 700,
    color: puedeBuscar && !cargando ? '#fff' : 'var(--ppto-panel-muted)',
    cursor: puedeBuscar && !cargando ? 'pointer' : 'not-allowed',
    opacity: cargando ? 0.85 : 1,
  }

  const btnLimpiar = {
    background: 'transparent',
    border: '1px solid var(--ppto-panel-outline)',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 'var(--cc-caption)',
    fontWeight: 700,
    color: 'var(--ppto-panel-text)',
    cursor: cargando ? 'wait' : 'pointer',
    opacity: cargando ? 0.7 : 1,
  }

  const handleBuscar = async (e) => {
    e.stopPropagation()
    if (!puedeBuscar || cargando) return
    if (busquedaActiva && checksPendientes) {
      await aplicarDesdeChecks()
      return
    }
    if (typeof onBuscar === 'function') await onBuscar()
  }

  const encabezado = !busquedaActiva
    ? 'Panel · validación Interventoría'
    : nivel === 'item' && capSel
      ? `Ítems · ${capSel}`
      : 'Capítulos · estado Interventoría'

  const puedeVolver = busquedaActiva && nivel === 'item'

  return (
    <div style={shellStyle}>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if (e.target.closest('button[data-ppto-panel-action]')) return
          setExpandido((v) => !v)
        }}
        onKeyDown={(e) => e.key === 'Enter' && setExpandido((v) => !v)}
        style={{
          padding: '7px 12px',
          borderBottom: expandido ? '1px solid var(--ppto-panel-border)' : 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--ppto-panel-header)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {puedeVolver && (
          <button
            type="button"
            data-ppto-panel-action
            onClick={(e) => {
              e.stopPropagation()
              volverCapitulos()
            }}
            style={btnAtras}
            title="Volver al listado de capítulos"
          >
            ← Atrás
          </button>
        )}
        <span
          style={{
            fontSize: 'var(--cc-sm)',
            fontWeight: 800,
            color: 'var(--ppto-panel-text)',
            flex: 1,
            minWidth: 0,
          }}
        >
          {encabezado}
        </span>
        {typeof onLimpiarTodo === 'function' && (
          <button
            type="button"
            data-ppto-panel-action
            disabled={cargando}
            onClick={(e) => {
              e.stopPropagation()
              onLimpiarTodo()
            }}
            title="Quitar todos los filtros y volver a la vista por capítulos (solo presupuesto vigente)"
            style={btnLimpiar}
          >
            Limpiar todo
          </button>
        )}
        <button
          type="button"
          data-ppto-panel-action
          disabled={!puedeBuscar || cargando}
          onClick={handleBuscar}
          title="Cargar grilla y resumen (solo presupuesto vigente; sin filtros → vista por capítulo)"
          style={btnBuscar}
        >
          {cargando ? '⏳ Buscando…' : '🔍 Buscar'}
        </button>
        {busquedaActiva && labels.length > 0 && (
          <>
            <span style={{ fontSize: 'var(--cc-caption)', color: 'var(--ppto-panel-muted)', fontWeight: 600 }}>
              {checks.size}/{labels.length} filas
            </span>
            <button
              type="button"
              data-ppto-panel-action
              disabled={cargando}
              onClick={(e) => {
                e.stopPropagation()
                aplicarDesdeChecks()
              }}
              style={{
                background: checksPendientes
                  ? 'var(--ppto-panel-accent)'
                  : `color-mix(in srgb, var(--ppto-panel-accent) 14%, var(--ppto-panel-header))`,
                border: checksPendientes ? 'none' : '1px solid var(--ppto-panel-border)',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 'var(--cc-caption)',
                fontWeight: 700,
                color: checksPendientes ? '#fff' : 'var(--ppto-panel-text)',
                cursor: cargando ? 'wait' : 'pointer',
              }}
            >
              {cargando ? '⏳…' : checksPendientes ? 'Aplicar filtros ●' : 'Aplicar filtros'}
            </button>
          </>
        )}
        {busquedaActiva && avanceGlobal.total > 0 && (
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title={`${avanceGlobal.pct}% del volumen ya salió de «No revisado». ${avanceGlobal.pendientes.toLocaleString('es-CO')} reg. pendientes en ${avanceGlobal.filasIncompletas} ${nivel === 'capitulo' ? 'capítulos' : 'ítems'}.`}
          >
            <IndicadorAvance pct={avanceGlobal.pct} pendientes={avanceGlobal.pendientes} size="sm" />
            <span style={{ fontSize: 'var(--cc-caption)', color: 'var(--ppto-panel-muted)', fontWeight: 600 }}>
              {avanceGlobal.pct}% validado
              {avanceGlobal.filasIncompletas > 0 ? (
                <span style={{ color: '#3B82F6', fontWeight: 700 }}> · {avanceGlobal.filasIncompletas} pend.</span>
              ) : null}
            </span>
          </span>
        )}
        {busquedaActiva && (
          <span style={{ fontSize: 'var(--cc-caption)', color: 'var(--ppto-panel-muted)', textAlign: 'right' }}>
            {totales.totalRegs.toLocaleString('es-CO')} reg.
            {verValoresEconomicos ? ` · ${fmt(totales.totalCosto)}` : ''}
          </span>
        )}
        <span style={{ color: 'var(--ppto-panel-muted)', fontSize: 'var(--cc-caption)' }} title={expandido ? 'Contraer panel' : 'Expandir panel'}>
          {expandido ? '▲' : '▼'}
        </span>
      </div>

      {expandido && (
        <div style={{ overflowX: 'auto', background: 'var(--ppto-panel-body)', borderTop: '1px solid var(--ppto-panel-outline)' }}>
          {!busquedaActiva ? (
            <div
              style={{
                padding: '14px 16px',
                fontSize: 'var(--cc-sm)',
                color: 'var(--ppto-panel-muted)',
                lineHeight: 1.5,
              }}
            >
              Configure criterios en <strong style={{ color: 'var(--ppto-panel-text)' }}>Filtros</strong> (barra superior) y pulse{' '}
              <strong style={{ color: 'var(--ppto-panel-text)' }}>Buscar</strong> aquí o en el popup para cargar capítulos e ítems.
            </div>
          ) : cargando ? (
            <div
              style={{
                padding: 16,
                textAlign: 'center',
                color: 'var(--ppto-panel-muted)',
                fontSize: 'var(--cc-sm)',
              }}
            >
              Cargando datos…
            </div>
          ) : filas.length === 0 ? (
            <div
              style={{
                padding: 16,
                textAlign: 'center',
                color: 'var(--ppto-panel-muted)',
                fontSize: 'var(--cc-sm)',
              }}
            >
              Sin registros para el filtro actual.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-caption)' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 36, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={labels.length > 0 && labels.every((l) => checks.has(l))}
                      onChange={(e) => toggleTodos(e.target.checked)}
                      title="Seleccionar todas las filas"
                    />
                  </th>
                  <th style={{ ...th, width: 52, textAlign: 'center' }} title="% registros ya revisados (fuera de No revisado)">
                    Avance
                  </th>
                  <th style={{ ...th, textAlign: 'left', minWidth: 200 }}>
                    {nivel === 'capitulo' ? (
                      'Capítulo'
                    ) : (
                      <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '0 12px' }}>
                        <span>Ítem · descripción</span>
                        <span style={{ textAlign: 'right' }}>Cant.</span>
                      </span>
                    )}
                  </th>
                  {PPTO_PANEL_ESTADOS.map((e) => (
                    <th key={e.key} style={{ ...th, textAlign: 'right' }}>
                      <div style={{ lineHeight: 1.25 }}>
                        <div>
                          <span style={{ color: e.color }}>●</span> {e.label}
                        </div>
                        <div style={{ fontWeight: 500, color: 'var(--ppto-panel-muted)', fontSize: '0.92em' }}>reg. | costo</div>
                      </div>
                    </th>
                  ))}
                  <th style={{ ...th, textAlign: 'right' }}>
                    <div style={{ lineHeight: 1.25 }}>
                      <div>Total</div>
                      <div style={{ fontWeight: 500, color: 'var(--ppto-panel-muted)', fontSize: '0.92em' }}>reg. | costo</div>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((g) => {
                  const necesitaAtencion = g.pctValidado < 100 && g.pendientesValidar > 0
                  return (
                  <tr
                    key={g.key}
                    style={{
                      borderBottom: '1px solid var(--ppto-panel-border)',
                      background: 'var(--ppto-panel-row)',
                      borderLeft: necesitaAtencion
                        ? '3px solid color-mix(in srgb, #3B82F6 55%, transparent)'
                        : g.pctValidado >= 100
                          ? '3px solid color-mix(in srgb, #10B981 35%, transparent)'
                          : '3px solid transparent',
                    }}
                  >
                    <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={checks.has(g.label)}
                        onChange={(e) => toggleCheck(g.label, e.target.checked)}
                      />
                    </td>
                    <td style={{ padding: '3px 4px', textAlign: 'center', verticalAlign: 'middle' }}>
                      <IndicadorAvance
                        pct={g.pctValidado}
                        pendientes={g.pendientesValidar}
                        size="sm"
                      />
                    </td>
                    <td style={{ padding: '4px 8px', maxWidth: 360, verticalAlign: 'middle' }}>
                      {nivel === 'capitulo' ? (
                        <button
                          type="button"
                          onClick={() => irCapituloItems(g)}
                          title="Ver ítems de este capítulo"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            textAlign: 'left',
                            fontWeight: 700,
                            color: 'var(--ppto-panel-accent)',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            fontSize: 'var(--cc-caption)',
                            lineHeight: 1.3,
                            wordBreak: 'break-word',
                          }}
                        >
                          {g.label}
                        </button>
                      ) : (
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1fr) auto',
                            gap: '2px 12px',
                            alignItems: 'center',
                            lineHeight: 1.3,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontWeight: 800, color: 'var(--ppto-panel-accent)' }}>{g.item}</span>
                            {(g.descripcion || itemDescMap[g.item]) && (
                              <span style={{ color: 'var(--ppto-panel-muted)', fontWeight: 500 }}>
                                {' '}
                                · {truncarTexto(g.descripcion || itemDescMap[g.item], 52)}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              textAlign: 'right',
                              fontWeight: 600,
                              color: 'var(--ppto-panel-text)',
                              whiteSpace: 'nowrap',
                              fontSize: 'var(--cc-caption)',
                            }}
                          >
                            {g.cantTotal > 0
                              ? `${g.cantTotal.toLocaleString('es-CO', { maximumFractionDigits: 4 })}${g.und ? ` ${g.und}` : ''}`
                              : '—'}
                          </div>
                        </div>
                      )}
                    </td>
                    {PPTO_PANEL_ESTADOS.map((e) => (
                      <td
                        key={e.key}
                        style={{ padding: '3px 8px', textAlign: 'right', verticalAlign: 'middle' }}
                      >
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            onFiltrarEstadoCelda?.({
                              nivel,
                              capitulo: g.capitulo,
                              item: g.item,
                              estado: e.key,
                            })
                          }}
                          disabled={!g.celdas[e.key]?.count}
                          title={
                            g.celdas[e.key]?.count
                              ? `Ver ${g.celdas[e.key].count.toLocaleString('es-CO')} registros «${e.label}» en la grilla`
                              : undefined
                          }
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: '2px 4px',
                            cursor: g.celdas[e.key]?.count ? 'pointer' : 'default',
                            width: '100%',
                            borderRadius: 4,
                          }}
                          onMouseEnter={(ev) => {
                            if (g.celdas[e.key]?.count) ev.currentTarget.style.background = 'color-mix(in srgb, var(--ppto-panel-accent) 12%, transparent)'
                          }}
                          onMouseLeave={(ev) => {
                            ev.currentTarget.style.background = 'transparent'
                          }}
                        >
                          <CeldaEstado
                            celda={g.celdas[e.key]}
                            verCostos={verValoresEconomicos}
                            fmt={fmt}
                            color={e.color}
                            mutedColor="var(--ppto-panel-muted)"
                            textColor="var(--ppto-panel-text)"
                          />
                        </button>
                      </td>
                    ))}
                    <td style={{ padding: '4px 8px', textAlign: 'right', verticalAlign: 'middle' }}>
                      <CeldaEstado
                        celda={{ count: g.totalRegs, costo: g.totalCosto }}
                        verCostos={verValoresEconomicos}
                        fmt={fmt}
                        color="var(--ppto-panel-accent)"
                        mutedColor="var(--ppto-panel-muted)"
                        textColor="var(--ppto-panel-text)"
                      />
                    </td>
                  </tr>
                )})}
                <tr style={{ background: 'var(--ppto-panel-footer)', fontWeight: 800 }}>
                  <td colSpan={2} style={{ padding: '8px 10px', color: 'var(--ppto-panel-text)', textAlign: 'center' }}>
                    <IndicadorAvance
                      pct={avanceGlobal.pct}
                      pendientes={avanceGlobal.pendientes}
                      size="sm"
                      title={`Total: ${avanceGlobal.pct}% validado`}
                    />
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--ppto-panel-text)' }}>
                    Total (vista filtrada)
                  </td>
                  {PPTO_PANEL_ESTADOS.map((e) => (
                    <td key={e.key} style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <CeldaEstado
                        celda={totales.celdas[e.key]}
                        verCostos={verValoresEconomicos}
                        fmt={fmt}
                        color={e.color}
                        mutedColor="var(--ppto-panel-muted)"
                        textColor="var(--ppto-panel-text)"
                      />
                    </td>
                  ))}
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    <CeldaEstado
                      celda={{ count: totales.totalRegs, costo: totales.totalCosto }}
                      verCostos={verValoresEconomicos}
                      fmt={fmt}
                      color="var(--ppto-panel-accent)"
                      mutedColor="var(--ppto-panel-muted)"
                      textColor="var(--ppto-panel-text)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          <div
            style={{
              padding: '8px 12px',
              fontSize: 'var(--cc-caption)',
              color: 'var(--ppto-panel-muted)',
              borderTop: '1px solid var(--ppto-panel-border)',
            }}
          >
            Clic en una celda de estado → carga esos registros en la grilla. Avance = % fuera de «No revisado». Solo presupuesto vigente.
          </div>
        </div>
      )}
    </div>
  )
}
