/**
 * Ambiente de Auditoría SicoeObra (sustituye Tab Por Cantidades para contratista).
 * Conserva 100% de Por Cantidades embebido; añade resumen + tabla hallazgos + plano.
 */
import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { pptoSheetStyles } from '../presupuesto/pptoSheetStyles'
import {
  fmtValorCop,
  justificacionesParaTipo,
  coloresMapaDesdeHallazgos,
  resumenAmbienteDesdeFilas,
  usuarioVeAuditoriaTraslapos,
} from './sicoeAuditoriaTraslapos'
import {
  fetchAuditoriaHallazgos,
  justificarAuditoriaHallazgo,
  syncAuditoriaHallazgos,
  fetchAuditoriaHallazgosExport,
} from './sicoeAuditoriaHallazgosApi'
import { downloadSicoeRegistrosExcel } from './sicoeExportExcel'
import SicoeCantidadesPorItemVista from './SicoeCantidadesPorItemVista'

const RESUMEN_KEYS = [
  {
    key: 'traslapos_sin_justificar',
    label: 'Traslapos sin justificar',
    color: '#dc2626',
  },
  {
    key: 'vacios_sin_justificar',
    label: 'Vacíos sin justificar',
    color: '#d97706',
  },
  {
    key: 'no_auditables',
    label: 'No auditables',
    color: '#ca8a04',
  },
  {
    key: 'inconsistencias',
    label: 'Inconsistencias',
    color: '#ea580c',
  },
  {
    key: 'justificados',
    label: 'Justificados',
    color: '#16a34a',
  },
]

const TIPO_LABEL = {
  traslapo: 'Traslapo',
  vacio: 'Vacío',
  no_auditable: 'No auditable',
  ubicacion_inconsistente: 'Ubicación inconsistente',
  costado_inconsistente: 'Costado inconsistente',
  cantidad_mayor_area: 'Cantidad > área',
}

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  justificado: 'Justificado',
  corregido: 'Corregido',
}

function txt(v) {
  return String(v || '').trim()
}

function fmtFecha(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

function regsNums(h) {
  const nums = []
  for (const r of h?.registros_involucrados || []) {
    const n = r?.numero_registro != null ? r.numero_registro : r?.id
    if (n != null && n !== '') nums.push(String(n))
  }
  return nums
}

function matchResumenFiltro(h, key) {
  if (!key) return true
  const estado = txt(h?.estado).toLowerCase() || 'pendiente'
  const tipo = txt(h?.tipo).toLowerCase()
  if (estado === 'corregido' && key !== 'corregidos') return false
  if (key === 'justificados') return estado === 'justificado'
  if (key === 'traslapos_sin_justificar') return tipo === 'traslapo' && estado === 'pendiente'
  if (key === 'vacios_sin_justificar') return tipo === 'vacio' && estado === 'pendiente'
  if (key === 'no_auditables') return tipo === 'no_auditable' && estado === 'pendiente'
  if (key === 'inconsistencias') {
    return (
      (tipo === 'ubicacion_inconsistente'
        || tipo === 'costado_inconsistente'
        || tipo === 'cantidad_mayor_area') &&
      estado === 'pendiente'
    )
  }
  return true
}

function compareVal(a, b, dir) {
  const mul = dir === 'asc' ? 1 : -1
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * mul
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' }) * mul
}

export default function SicoeAmbienteAuditoria({
  t,
  usuario,
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
  renderMap = null,
  exportMeta = null,
}) {
  const sheet = pptoSheetStyles(t)
  const veAuditoria = usuarioVeAuditoriaTraslapos(usuario)

  const [hallazgos, setHallazgos] = useState([])
  const [resumen, setResumen] = useState(() => resumenAmbienteDesdeFilas([]))
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [resumenFiltro, setResumenFiltro] = useState(null)
  const [colFiltros, setColFiltros] = useState({})
  const [orden, setOrden] = useState({ col: 'valor_en_juego', dir: 'desc' })
  const [agruparPor, setAgruparPor] = useState('') // '' | item | tramo | usuario
  const [seleccionadoId, setSeleccionadoId] = useState(null)
  const [justificandoId, setJustificandoId] = useState(null)
  const [justSel, setJustSel] = useState('')
  const [msgJust, setMsgJust] = useState('')
  const [panelCantidades, setPanelCantidades] = useState(true)
  const [exportando, setExportando] = useState(false)
  const [mostrarCorregidos, setMostrarCorregidos] = useState(false)

  const cargar = useCallback(
    async ({ sincronizar = false } = {}) => {
      if (!veAuditoria || !contratoId || !token) return
      setError('')
      if (sincronizar) setSyncing(true)
      else setLoading(true)
      try {
        const data = sincronizar
          ? await syncAuditoriaHallazgos({ API_URL, contratoId, token, usuario })
          : await fetchAuditoriaHallazgos({ API_URL, contratoId, token, usuario })
        const list = Array.isArray(data?.hallazgos) ? data.hallazgos : []
        setHallazgos(list)
        setResumen(data?.resumen || resumenAmbienteDesdeFilas(list))
      } catch (e) {
        setError(e?.message || 'No se pudieron cargar los hallazgos')
      } finally {
        setLoading(false)
        setSyncing(false)
      }
    },
    [API_URL, contratoId, token, usuario, veAuditoria],
  )

  useEffect(() => {
    void cargar({ sincronizar: true })
  }, [contratoId, refreshNonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(() => {
    let list = hallazgos.filter((h) => {
      const estado = txt(h?.estado).toLowerCase()
      if (!mostrarCorregidos && estado === 'corregido') return false
      if (!matchResumenFiltro(h, resumenFiltro)) return false
      for (const [col, raw] of Object.entries(colFiltros || {})) {
        const q = txt(raw).toLowerCase()
        if (!q) continue
        let val = ''
        if (col === 'registros') val = regsNums(h).join(', ')
        else if (col === 'usuario') val = h?.justificado_por_nombre || ''
        else if (col === 'fecha') val = h?.justificado_en || ''
        else val = h?.[col] ?? ''
        if (!String(val).toLowerCase().includes(q)) return false
      }
      return true
    })
    const { col, dir } = orden || {}
    list = [...list].sort((a, b) => {
      let va
      let vb
      if (col === 'registros') {
        va = regsNums(a).join(',')
        vb = regsNums(b).join(',')
      } else if (col === 'usuario') {
        va = a?.justificado_por_nombre
        vb = b?.justificado_por_nombre
      } else if (col === 'fecha') {
        va = a?.justificado_en
        vb = b?.justificado_en
      } else if (col === 'valor_en_juego' || col === 'medida_m') {
        va = Number(a?.[col]) || 0
        vb = Number(b?.[col]) || 0
      } else {
        va = a?.[col]
        vb = b?.[col]
      }
      return compareVal(va, vb, dir)
    })
    return list
  }, [hallazgos, resumenFiltro, colFiltros, orden, mostrarCorregidos])

  const grupos = useMemo(() => {
    if (!agruparPor) return null
    const map = new Map()
    for (const h of filtrados) {
      let key = '—'
      if (agruparPor === 'item') key = txt(h.item_numero) || '—'
      else if (agruparPor === 'tramo') key = txt(h.tramo) || '—'
      else if (agruparPor === 'usuario') key = txt(h.justificado_por_nombre) || 'Sin usuario'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(h)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [filtrados, agruparPor])

  const seleccionado = useMemo(
    () => filtrados.find((h) => String(h.id) === String(seleccionadoId)) || null,
    [filtrados, seleccionadoId],
  )

  const coloresMapa = useMemo(
    () =>
      coloresMapaDesdeHallazgos(filtrados, {
        seleccionadoId: seleccionado?.id ?? null,
      }),
    [filtrados, seleccionado],
  )

  const focusPkids = useMemo(() => {
    // Solo centrar al seleccionar un hallazgo concreto; sin selección → vista completa de la obra.
    const set = new Set()
    if (!seleccionado) return []
    for (const r of seleccionado?.registros_involucrados || []) {
      if (r?.pk_id_id != null && String(r.pk_id_id).trim()) {
        set.add(String(r.pk_id_id).trim())
      }
    }
    if (seleccionado?.pk_id_id != null && String(seleccionado.pk_id_id).trim()) {
      set.add(String(seleccionado.pk_id_id).trim())
    }
    return [...set]
  }, [seleccionado])

  const toggleOrden = (col) => {
    setOrden((prev) => {
      if (prev.col === col) {
        return { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      }
      return { col, dir: col === 'valor_en_juego' ? 'desc' : 'asc' }
    })
  }

  const onJustificar = async (h) => {
    if (!justSel) {
      setMsgJust('Seleccione una justificación')
      return
    }
    setMsgJust('')
    try {
      await justificarAuditoriaHallazgo({
        API_URL,
        contratoId,
        token,
        hallazgoId: h.id,
        justificacion: justSel,
      })
      setJustificandoId(null)
      setJustSel('')
      await cargar({ sincronizar: false })
    } catch (e) {
      setMsgJust(e?.message || 'No se pudo justificar')
    }
  }

  const onExportExcel = async () => {
    setExportando(true)
    try {
      const data = await fetchAuditoriaHallazgosExport({
        API_URL,
        contratoId,
        token,
        filtros: {
          resumen_filtro: resumenFiltro || undefined,
          item_numero: colFiltros.item_numero || undefined,
          tramo: colFiltros.tramo || undefined,
          usuario: colFiltros.usuario || undefined,
          tipo: colFiltros.tipo || undefined,
          estado: colFiltros.estado || undefined,
        },
      })
      // Re-filtra en cliente para coincidir exactamente con la tabla visible
      const idSet = new Set(filtrados.map((h) => String(h.id)))
      const headers = data?.headers || []
      let rows = data?.rows || []
      if (idSet.size && hallazgos.length) {
        // Preferir filas construidas desde filtrados (filtros de columna client-side)
        rows = filtrados.map((f) => [
          f.tipo || '',
          f.item_numero || '',
          f.tramo || '',
          f.infraestructura || '',
          f.costado || '',
          f.ubicacion || '',
          f.medida_m ?? '',
          regsNums(f).join(', '),
          f.valor_en_juego || 0,
          f.estado || '',
          f.justificacion || '',
          f.justificado_por_nombre || '',
          f.justificado_en || '',
        ])
      }
      await downloadSicoeRegistrosExcel({
        meta: exportMeta || {},
        headers: headers.length ? headers : [
          'Tipo', 'Ítem', 'Tramo', 'Infraestructura', 'Costado', 'Ubicación',
          'Medida (m)', 'Registros', 'Valor en juego', 'Estado', 'Justificación', 'Usuario', 'Fecha',
        ],
        bodyRows: rows,
        filename: `sicoe_auditoria_hallazgos_${contratoId || 'NA'}.xlsx`,
      })
    } catch (e) {
      setError(e?.message || 'No se pudo exportar')
    } finally {
      setExportando(false)
    }
  }

  const abrirInvolucrados = (h) => {
    const regs = h?.registros_involucrados || []
    if (!regs.length || !onAbrirRegistro) return
    const first = regs[0]
    onAbrirRegistro({
      id: first.id,
      reporte_id: first.reporte_id,
      numero_registro: first.numero_registro,
      item_numero: first.item_numero || h.item_numero,
    })
  }

  const thBtn = (col, label, width) => (
    <th
      key={col}
      style={{ ...sheet.th, width, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => toggleOrden(col)}
      title="Ordenar"
    >
      {label}
      {orden.col === col ? (orden.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  const renderFila = (h) => {
    const sel = String(h.id) === String(seleccionadoId)
    const tipoColor =
      h.tipo === 'traslapo'
        ? '#dc2626'
        : h.tipo === 'vacio'
          ? '#d97706'
          : h.tipo === 'ubicacion_inconsistente'
            || h.tipo === 'costado_inconsistente'
            || h.tipo === 'cantidad_mayor_area'
            ? '#ea580c'
            : '#ca8a04'
    const justOpts = justificacionesParaTipo(h.tipo)
    return (
      <tr
        key={h.id}
        onClick={() => setSeleccionadoId(h.id)}
        style={{
          background: sel ? `${t.primary}22` : undefined,
          cursor: 'pointer',
        }}
      >
        <td style={{ ...sheet.td, color: tipoColor, fontWeight: 700 }}>
          {TIPO_LABEL[h.tipo] || h.tipo}
        </td>
        <td style={sheet.td}>{h.item_numero || '—'}</td>
        <td style={sheet.td}>{h.tramo || '—'}</td>
        <td style={sheet.td}>{h.infraestructura || '—'}</td>
        <td style={sheet.td}>{h.costado || '—'}</td>
        <td style={sheet.td}>{h.ubicacion || '—'}</td>
        <td style={{ ...sheet.td, textAlign: 'right' }}>
          {h.medida_m != null ? h.medida_m : '—'}
        </td>
        <td style={sheet.td}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              abrirInvolucrados(h)
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: t.primary,
              fontWeight: 700,
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
            title="Abrir registros involucrados"
          >
            {regsNums(h).join(', ') || '—'}
          </button>
        </td>
        <td style={{ ...sheet.td, textAlign: 'right', fontWeight: 700 }}>
          {fmtValorCop(h.valor_en_juego)}
        </td>
        <td style={sheet.td}>{ESTADO_LABEL[h.estado] || h.estado}</td>
        <td style={sheet.td} onClick={(e) => e.stopPropagation()}>
          {h.estado === 'justificado' ? (
            h.justificacion || '—'
          ) : h.estado === 'corregido' ? (
            '—'
          ) : justificandoId === h.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
              <select
                value={justSel}
                onChange={(e) => setJustSel(e.target.value)}
                style={{
                  background: t.inputBg || t.bgCard,
                  color: t.text,
                  border: `1px solid ${t.border}`,
                  borderRadius: 6,
                  padding: '4px 6px',
                  fontSize: 'var(--cc-caption)',
                }}
              >
                <option value="">Justificación…</option>
                {justOpts.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => onJustificar(h)}
                  style={{
                    background: t.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: 'var(--cc-caption)',
                  }}
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJustificandoId(null)
                    setJustSel('')
                    setMsgJust('')
                  }}
                  style={{
                    background: 'transparent',
                    color: t.textMuted,
                    border: `1px solid ${t.border}`,
                    borderRadius: 6,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: 'var(--cc-caption)',
                  }}
                >
                  Cancelar
                </button>
              </div>
              {msgJust && (
                <span style={{ color: '#dc2626', fontSize: 'var(--cc-caption)' }}>{msgJust}</span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setJustificandoId(h.id)
                setJustSel('')
                setMsgJust('')
              }}
              style={{
                background: 'transparent',
                color: t.primary,
                border: `1px solid ${t.primary}`,
                borderRadius: 6,
                padding: '3px 8px',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 'var(--cc-caption)',
              }}
            >
              Justificar
            </button>
          )}
        </td>
        <td style={sheet.td}>{h.justificado_por_nombre || '—'}</td>
        <td style={sheet.td}>{fmtFecha(h.justificado_en)}</td>
      </tr>
    )
  }

  if (!veAuditoria) {
    return (
      <SicoeCantidadesPorItemVista
        t={t}
        contratoId={contratoId}
        token={token}
        API_URL={API_URL}
        nivelInfo={nivelInfo}
        nivelesContrato={nivelesContrato}
        busquedaActiva={busquedaActiva}
        buildFiltrosParams={buildFiltrosParams}
        onAbrirRegistro={onAbrirRegistro}
        onValidarRapido={onValidarRapido}
        ejecutandoValidacion={ejecutandoValidacion}
        refreshNonce={refreshNonce}
        filtrosVersion={filtrosVersion}
      />
    )
  }

  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 900

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Resumen */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isNarrow ? '1fr 1fr' : 'repeat(5, 1fr)',
          gap: 8,
        }}
      >
        {RESUMEN_KEYS.map(({ key, label, color }) => {
          const block = resumen?.[key] || { cantidad: 0, valor: 0 }
          const active = resumenFiltro === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setResumenFiltro((prev) => (prev === key ? null : key))}
              style={{
                textAlign: 'left',
                background: active ? `${color}22` : t.bgCard,
                border: `1px solid ${active ? color : t.border}`,
                borderRadius: 10,
                padding: '10px 12px',
                cursor: 'pointer',
                color: t.text,
              }}
            >
              <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>
                {label}
              </div>
              <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 900, color, marginTop: 2 }}>
                {block.cantidad ?? 0}
              </div>
              <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 2 }}>
                {fmtValorCop(block.valor)}
              </div>
            </button>
          )
        })}
      </div>

      {/* Toolbar hallazgos */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <strong style={{ color: t.text }}>Hallazgos</strong>
          {(loading || syncing) && (
            <span style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
              {syncing ? 'Sincronizando…' : 'Cargando…'}
            </span>
          )}
          {error && (
            <span style={{ color: '#dc2626', fontSize: 'var(--cc-caption)' }}>{error}</span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, display: 'flex', gap: 4, alignItems: 'center' }}>
            Agrupar
            <select
              value={agruparPor}
              onChange={(e) => setAgruparPor(e.target.value)}
              style={{
                background: t.inputBg || t.bgCard,
                color: t.text,
                border: `1px solid ${t.border}`,
                borderRadius: 6,
                padding: '4px 8px',
              }}
            >
              <option value="">Sin agrupar</option>
              <option value="item">Por ítem</option>
              <option value="tramo">Por tramo</option>
              <option value="usuario">Por usuario</option>
            </select>
          </label>
          <label style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={mostrarCorregidos}
              onChange={(e) => setMostrarCorregidos(e.target.checked)}
            />
            Corregidos
          </label>
          <button
            type="button"
            onClick={() => cargar({ sincronizar: true })}
            disabled={syncing}
            style={{
              background: t.bgCard,
              color: t.text,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              padding: '6px 10px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 'var(--cc-caption)',
            }}
          >
            Actualizar
          </button>
          <button
            type="button"
            onClick={onExportExcel}
            disabled={exportando || !filtrados.length}
            style={{
              background: t.primary,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '6px 10px',
              fontWeight: 700,
              cursor: filtrados.length ? 'pointer' : 'not-allowed',
              fontSize: 'var(--cc-caption)',
              opacity: filtrados.length ? 1 : 0.5,
            }}
          >
            {exportando ? 'Exportando…' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Tabla + plano */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isNarrow ? '1fr' : 'minmax(0, 1.4fr) minmax(280px, 0.9fr)',
          gap: 12,
          alignItems: 'stretch',
        }}
      >
        <div style={{ ...sheet.sheetWrap, maxHeight: isNarrow ? 360 : 480 }}>
          <table style={{ ...sheet.sheetTable, minWidth: 980 }}>
            <thead>
              <tr>
                {thBtn('tipo', 'Tipo', 90)}
                {thBtn('item_numero', 'Ítem', 70)}
                {thBtn('tramo', 'Tramo', 90)}
                {thBtn('infraestructura', 'Infraestructura', 110)}
                {thBtn('costado', 'Costado', 80)}
                {thBtn('ubicacion', 'Ubicación', 140)}
                {thBtn('medida_m', 'Medida', 70)}
                {thBtn('registros', 'Registros', 100)}
                {thBtn('valor_en_juego', 'Valor en juego', 110)}
                {thBtn('estado', 'Estado', 90)}
                {thBtn('justificacion', 'Justificación', 140)}
                {thBtn('usuario', 'Usuario', 110)}
                {thBtn('fecha', 'Fecha', 120)}
              </tr>
              <tr>
                {[
                  'tipo', 'item_numero', 'tramo', 'infraestructura', 'costado', 'ubicacion',
                  'medida_m', 'registros', 'valor_en_juego', 'estado', 'justificacion', 'usuario', 'fecha',
                ].map((col) => (
                  <th key={`f-${col}`} style={{ ...sheet.th, padding: 4, background: t.inputBg || t.bg }}>
                    <input
                      value={colFiltros[col] || ''}
                      onChange={(e) =>
                        setColFiltros((prev) => ({ ...prev, [col]: e.target.value }))
                      }
                      placeholder="Filtrar"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        background: t.bgCard,
                        color: t.text,
                        border: `1px solid ${t.border}`,
                        borderRadius: 4,
                        padding: '2px 4px',
                        fontSize: 'var(--cc-caption)',
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!filtrados.length ? (
                <tr>
                  <td colSpan={13} style={{ ...sheet.td, textAlign: 'center', color: t.textMuted }}>
                    {loading || syncing
                      ? 'Analizando hallazgos del contrato…'
                      : 'Sin hallazgos con los filtros actuales'}
                  </td>
                </tr>
              ) : grupos ? (
                grupos.map(([nombre, rows]) => (
                  <Fragment key={`g-${nombre}`}>
                    <tr>
                      <td
                        colSpan={13}
                        style={{
                          ...sheet.td,
                          background: sheet.headerBg,
                          color: sheet.headerColor,
                          fontWeight: 800,
                        }}
                      >
                        {agruparPor === 'item' ? 'Ítem' : agruparPor === 'tramo' ? 'Tramo' : 'Usuario'}: {nombre}
                        {' · '}
                        {rows.length} hallazgo{rows.length === 1 ? '' : 's'}
                      </td>
                    </tr>
                    {rows.map(renderFila)}
                  </Fragment>
                ))
              ) : (
                filtrados.map(renderFila)
              )}
            </tbody>
          </table>
        </div>

        <div
          style={{
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: isNarrow ? 240 : 320,
          }}
        >
          <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-sm)' }}>
            Plano semáforo
            {seleccionado ? (
              <span style={{ fontWeight: 500, color: t.textMuted }}>
                {' '}· {TIPO_LABEL[seleccionado.tipo] || seleccionado.tipo}
                {seleccionado.item_numero ? ` · Ítem ${seleccionado.item_numero}` : ''}
              </span>
            ) : (
              <span style={{ fontWeight: 500, color: t.textMuted }}>
                {' '}· {filtrados.length} filtrado{filtrados.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          {typeof renderMap === 'function' ? (
            renderMap({
              colores: coloresMapa,
              height: isNarrow ? 220 : 360,
              focusPkids,
              seleccionado,
              hallazgos: filtrados,
              highlightRegistroIds: (seleccionado?.registros_involucrados || [])
                .map((r) => r?.id)
                .filter((id) => id != null),
              highlightPkIds: [
                ...new Set(
                  [
                    seleccionado?.pk_id_id,
                    ...((seleccionado?.registros_involucrados || []).map((r) => r?.pk_id_id)),
                  ].filter((id) => id != null).map(String),
                ),
              ],
              filterItemNumeros: [
                ...new Set(
                  filtrados.map((h) => h.item_numero).filter(Boolean).map(String),
                ),
              ],
            })
          ) : (
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)', padding: 12 }}>
              Mapa no disponible en este contexto.
            </div>
          )}
          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
            Cada ítem actúa como capa. Seleccione un hallazgo para centrar y resaltar sus registros
            (PK / abscisas).
          </div>
        </div>
      </div>

      {/* Por Cantidades embebido */}
      <div
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setPanelCantidades((v) => !v)}
          style={{
            width: '100%',
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            borderBottom: panelCantidades ? `1px solid ${t.border}` : 'none',
            padding: '10px 12px',
            color: t.text,
            fontWeight: 800,
            cursor: 'pointer',
            fontSize: 'var(--cc-sm)',
          }}
        >
          {panelCantidades ? '▾' : '▸'} Vista Por cantidades
        </button>
        {panelCantidades && (
          <div style={{ padding: 8 }}>
            <SicoeCantidadesPorItemVista
              t={t}
              contratoId={contratoId}
              token={token}
              API_URL={API_URL}
              nivelInfo={nivelInfo}
              nivelesContrato={nivelesContrato}
              busquedaActiva={busquedaActiva}
              buildFiltrosParams={buildFiltrosParams}
              onAbrirRegistro={onAbrirRegistro}
              onValidarRapido={onValidarRapido}
              ejecutandoValidacion={ejecutandoValidacion}
              refreshNonce={refreshNonce}
              filtrosVersion={filtrosVersion}
            />
          </div>
        )}
      </div>
    </div>
  )
}
