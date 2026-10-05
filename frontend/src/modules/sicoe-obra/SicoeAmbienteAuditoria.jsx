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
  dedupeHallazgosAmbiente,
  esTraslapoMismoReporte,
  esVacioFueraDeLimite,
  resumenAmbienteDesdeFilas,
  usuarioVeAuditoriaTraslapos,
} from './sicoeAuditoriaTraslapos'
import {
  fetchAuditoriaHallazgos,
  justificarAuditoriaHallazgo,
  syncAuditoriaHallazgos,
  fetchAuditoriaHallazgosExport,
} from './sicoeAuditoriaHallazgosApi'
import { mensajeErrorCarga, fmtFechaHallazgosGuardados } from './sicoeAuditoriaMensajes'
import { downloadSicoeRegistrosExcel } from './sicoeExportExcel'
import SicoeCantidadesPorItemVista from './SicoeCantidadesPorItemVista'
import SicoeHallazgoDetalle from './SicoeHallazgoDetalle'
import {
  ayudaMedidaPorTipo,
  fmtRegistrosHallazgo,
  tooltipTipoHallazgo,
  unidadMedidaHallazgo,
} from './sicoeAuditoriaTooltips'

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

/** Ayuda breve por columna (tooltip / toque en ?). */
const COLUMNA_AYUDA = {
  tipo: 'Pase el cursor sobre cada tipo para ver qué detectó el sistema y qué revisar, con los datos de ese hallazgo.',
  item_numero: 'Número del ítem del presupuesto involucrado en el hallazgo.',
  tramo: 'Tramo de la obra donde se ubican los registros comparados.',
  infraestructura: 'Infraestructura o elemento (calzada, andén, etc.) del grupo comparado.',
  ubicacion: 'Abscisas o PK-ID donde ocurre el traslapo, el vacío o la inconsistencia.',
  medida_m: 'Medida del hallazgo. En vacíos solo se alertan huecos cortos (menores a 50 m por defecto); los tramos largos sin trabajo no cuentan.',
  registros: 'Registros involucrados con el número de su reporte. Clic abre el primero.',
  valor_en_juego: 'Valor económico estimado asociado al hallazgo (costo directo del tramo afectado).',
  justificacion: 'Razón elegida al justificar el hallazgo, si aplica.',
}

function txt(v) {
  return String(v || '').trim()
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
  /** true solo tras una consulta GET/sync exitosa; evita fingir auditoría limpia. */
  const [cargaOk, setCargaOk] = useState(false)
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
  const [colAyudaAbierta, setColAyudaAbierta] = useState(null)
  /** ISO de la última actualización de hallazgos (servidor). */
  const [hallazgosActualizadoEn, setHallazgosActualizadoEn] = useState(null)
  /** true si la UI muestra datos de GET porque el sync falló. */
  const [mostrandoGuardados, setMostrandoGuardados] = useState(false)
  /**
   * Ámbito de filtros del módulo (Acta RPO / capítulo / ítem / …).
   * null = sin filtro de módulo (muestra todo).
   * Set vacío = filtros activos pero 0 registros.
   */
  const [ambitoRegIds, setAmbitoRegIds] = useState(null)

  const aplicarDatos = useCallback((data, { desdeSync = false } = {}) => {
    const vmax = data?.vacio_max_m
    const list = dedupeHallazgosAmbiente(
      (Array.isArray(data?.hallazgos) ? data.hallazgos : [])
        .filter((h) => !esTraslapoMismoReporte(h))
        .filter((h) => !esVacioFueraDeLimite(h, vmax)),
    )
    setHallazgos(list)
    setResumen(resumenAmbienteDesdeFilas(list, vmax))
    const act =
      data?.sincronizado_en
      || data?.actualizado_en
      || list.reduce((best, h) => {
        const v = h?.actualizado_en || h?.creado_en
        if (!v) return best
        const s = String(v)
        return !best || s > best ? s : best
      }, null)
    if (act) setHallazgosActualizadoEn(act)
    if (desdeSync) setMostrandoGuardados(false)
    setCargaOk(true)
  }, [])

  const cargar = useCallback(
    async ({ sincronizar = false } = {}) => {
      if (!veAuditoria || !contratoId || !token) return
      setError('')
      setLoading(true)
      let gotList = false
      let fechaLista = null
      try {
        // 1) GET rápido: muestra hallazgos persistidos sin esperar el análisis completo
        const data = await fetchAuditoriaHallazgos({ API_URL, contratoId, token, usuario })
        aplicarDatos(data, { desdeSync: false })
        gotList = true
        fechaLista =
          data?.actualizado_en
          || (Array.isArray(data?.hallazgos)
            ? data.hallazgos.reduce((best, h) => {
              const v = h?.actualizado_en || h?.creado_en
              if (!v) return best
              const s = String(v)
              return !best || s > best ? s : best
            }, null)
            : null)
      } catch (e) {
        setCargaOk(false)
        setError(
          mensajeErrorCarga(
            e,
            'No se pudieron cargar los hallazgos.',
            { status: e?.status, context: 'carga' },
          ),
        )
      } finally {
        setLoading(false)
      }

      if (!sincronizar) return

      // 2) Sync completo (análisis + dibujos + persistencia por lotes)
      setSyncing(true)
      try {
        const sync = await syncAuditoriaHallazgos({
          API_URL,
          contratoId,
          token,
          usuario,
          incluirHuellas: false,
        })
        aplicarDatos(sync, { desdeSync: true })
        setError('')
        setMostrandoGuardados(false)
      } catch (e) {
        const msg = mensajeErrorCarga(
          e,
          'No se pudo sincronizar el análisis de hallazgos.',
          { status: e?.status, context: 'sync' },
        )
        if (gotList) {
          setMostrandoGuardados(true)
          const cuando = fmtFechaHallazgosGuardados(fechaLista)
          setError(
            cuando
              ? `${msg} Se muestran los hallazgos guardados del ${cuando}. Use Reintentar para volver a sincronizar.`
              : `${msg} Se muestran los hallazgos guardados. Use Reintentar para volver a sincronizar.`,
          )
        } else {
          setCargaOk(false)
          setError(msg)
        }
      } finally {
        setSyncing(false)
      }
    },
    [API_URL, aplicarDatos, contratoId, token, usuario, veAuditoria],
  )

  useEffect(() => {
    setCargaOk(false)
    setHallazgos([])
    setResumen(resumenAmbienteDesdeFilas([]))
    setSeleccionadoId(null)
    setError('')
    setMostrandoGuardados(false)
    setHallazgosActualizadoEn(null)
    void cargar({ sincronizar: true })
  }, [contratoId, refreshNonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // Filtros del módulo (Acta RPO, capítulo, ítem, …) → IDs de registro del ámbito.
  useEffect(() => {
    let cancelled = false
    const loadAmbito = async () => {
      if (!busquedaActiva || typeof buildFiltrosParams !== 'function') {
        if (!cancelled) setAmbitoRegIds(null)
        return
      }
      try {
        const params = buildFiltrosParams()
        if (!params || ![...params.keys()].length) {
          if (!cancelled) setAmbitoRegIds(new Set())
          return
        }
        const res = await fetch(
          `${API_URL}/sicoe-obra/${contratoId}/cantidades-por-item?${params}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.detail || `Error ${res.status}`)
        const ids = new Set(
          (Array.isArray(data?.registros) ? data.registros : [])
            .map((r) => (r?.id != null ? String(r.id) : ''))
            .filter(Boolean),
        )
        if (!cancelled) setAmbitoRegIds(ids)
      } catch {
        // Si falla el ámbito, no bloquear: mostrar hallazgos sin filtro de módulo.
        if (!cancelled) setAmbitoRegIds(null)
      }
    }
    void loadAmbito()
    return () => { cancelled = true }
  }, [API_URL, busquedaActiva, buildFiltrosParams, contratoId, filtrosVersion, token])

  const filtradosAmbito = useMemo(() => {
    return hallazgos.filter((h) => {
      const estado = txt(h?.estado).toLowerCase()
      if (!mostrarCorregidos && estado === 'corregido') return false
      // Filtros del módulo: el hallazgo entra si algún involucrado está en el ámbito.
      if (ambitoRegIds != null) {
        if (!ambitoRegIds.size) return false
        const inv = Array.isArray(h?.registros_involucrados) ? h.registros_involucrados : []
        const hit = inv.some((r) => r?.id != null && ambitoRegIds.has(String(r.id)))
        if (!hit) return false
      }
      for (const [col, raw] of Object.entries(colFiltros || {})) {
        const q = txt(raw).toLowerCase()
        if (!q) continue
        let val = ''
        if (col === 'registros') val = fmtRegistrosHallazgo(h)
        else if (col === 'usuario') val = h?.justificado_por_nombre || ''
        else if (col === 'fecha') val = h?.justificado_en || ''
        else val = h?.[col] ?? ''
        if (!String(val).toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [hallazgos, colFiltros, mostrarCorregidos, ambitoRegIds])

  // Contadores = hallazgos del ámbito (filtros de módulo), sin el click de tarjeta.
  const resumenVista = useMemo(
    () => resumenAmbienteDesdeFilas(filtradosAmbito),
    [filtradosAmbito],
  )

  const filtrados = useMemo(() => {
    let list = filtradosAmbito.filter((h) => matchResumenFiltro(h, resumenFiltro))
    const { col, dir } = orden || {}
    list = [...list].sort((a, b) => {
      let va
      let vb
      if (col === 'registros') {
        va = fmtRegistrosHallazgo(a)
        vb = fmtRegistrosHallazgo(b)
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
  }, [filtradosAmbito, resumenFiltro, orden])

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

  // Clave estable para no remountar el mapa en cada render
  const filterItemKey = useMemo(() => {
    const items = [
      ...new Set(filtrados.map((h) => h.item_numero).filter(Boolean).map(String)),
    ].sort()
    return items.join('|')
  }, [filtrados])

  const filterItemNumeros = useMemo(
    () => (filterItemKey ? filterItemKey.split('|') : []),
    [filterItemKey],
  )

  /** Solo el hallazgo seleccionado; si no, el ámbito de filtros; si no, ninguna huella (solo eje). */
  const filterRegistroIds = useMemo(() => {
    if (seleccionado) {
      const ids = []
      for (const r of seleccionado?.registros_involucrados || []) {
        if (r?.id != null) ids.push(r.id)
      }
      return [...new Set(ids.map(String))]
    }
    if (ambitoRegIds != null) return [...ambitoRegIds]
    return []
  }, [seleccionado, ambitoRegIds])

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
          f.ubicacion || '',
          f.medida_m != null
            ? `${f.medida_m}${unidadMedidaHallazgo(f.tipo) ? ` ${unidadMedidaHallazgo(f.tipo)}` : ''}`
            : '',
          fmtRegistrosHallazgo(f),
          f.valor_en_juego || 0,
          f.justificacion || '',
        ])
        await downloadSicoeRegistrosExcel({
          meta: exportMeta || {},
          headers: [
            'Tipo', 'Ítem', 'Tramo', 'Infraestructura', 'Ubicación',
            'Medida', 'Registros', 'Valor en juego', 'Justificación',
          ],
          bodyRows: rows,
          filename: `sicoe_auditoria_hallazgos_${contratoId || 'NA'}.xlsx`,
        })
        return
      }
      await downloadSicoeRegistrosExcel({
        meta: exportMeta || {},
        headers: headers.length ? headers : [
          'Tipo', 'Ítem', 'Tramo', 'Infraestructura', 'Ubicación',
          'Medida', 'Registros', 'Valor en juego', 'Justificación',
        ],
        bodyRows: rows,
        filename: `sicoe_auditoria_hallazgos_${contratoId || 'NA'}.xlsx`,
      })
    } catch (e) {
      setError(mensajeErrorCarga(e, 'No se pudo exportar'))
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

  const thBtn = (col, label, width) => {
    const ayuda = COLUMNA_AYUDA[col] || ''
    const open = colAyudaAbierta === col
    return (
      <th
        key={col}
        style={{ ...sheet.th, width, position: 'relative', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
          <button
            type="button"
            onClick={() => toggleOrden(col)}
            title={`Ordenar por ${label}`}
            aria-label={`Ordenar por ${label}`}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              font: 'inherit',
              fontWeight: 'inherit',
              cursor: 'pointer',
              padding: 0,
              textAlign: 'left',
            }}
          >
            {label}
            {orden.col === col ? (orden.dir === 'asc' ? ' ↑' : ' ↓') : ''}
          </button>
          {ayuda && (
            <button
              type="button"
              title={ayuda}
              aria-label={`Ayuda: ${label}`}
              aria-expanded={open}
              onClick={(e) => {
                e.stopPropagation()
                setColAyudaAbierta((cur) => (cur === col ? null : col))
              }}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: `1px solid currentColor`,
                background: 'transparent',
                color: 'inherit',
                fontSize: 10,
                fontWeight: 800,
                lineHeight: '14px',
                padding: 0,
                cursor: 'pointer',
                opacity: 0.85,
                flexShrink: 0,
              }}
            >
              ?
            </button>
          )}
        </div>
        {open && ayuda && (
          <div
            role="tooltip"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 20,
              marginTop: 4,
              minWidth: 180,
              maxWidth: 260,
              background: t.bgCard || '#fff',
              color: t.text,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 'var(--cc-caption)',
              fontWeight: 500,
              boxShadow: '0 8px 20px rgba(15,23,42,0.18)',
              whiteSpace: 'normal',
            }}
          >
            {ayuda}
          </div>
        )}
      </th>
    )
  }

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
        <td style={{ ...sheet.td, color: tipoColor, fontWeight: 700 }} title={tooltipTipoHallazgo(h)}>
          {TIPO_LABEL[h.tipo] || h.tipo}
        </td>
        <td style={sheet.td}>{h.item_numero || '—'}</td>
        <td style={sheet.td}>{h.tramo || '—'}</td>
        <td style={sheet.td}>{h.infraestructura || '—'}</td>
        <td style={sheet.td}>{h.ubicacion || '—'}</td>
        <td
          style={{ ...sheet.td, textAlign: 'right' }}
          title={ayudaMedidaPorTipo(h.tipo)}
        >
          {h.medida_m != null
            ? `${h.medida_m}${unidadMedidaHallazgo(h.tipo) ? ` ${unidadMedidaHallazgo(h.tipo)}` : ''}`
            : '—'}
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
              textAlign: 'left',
              fontSize: 'var(--cc-caption)',
              lineHeight: 1.35,
            }}
            title="Abrir registros involucrados"
          >
            {fmtRegistrosHallazgo(h)}
          </button>
        </td>
        <td style={{ ...sheet.td, textAlign: 'right', fontWeight: 700 }}>
          {fmtValorCop(h.valor_en_juego)}
        </td>
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
          const block = cargaOk ? (resumenVista?.[key] || { cantidad: 0, valor: 0 }) : null
          const active = resumenFiltro === key
          return (
            <button
              key={key}
              type="button"
              disabled={!cargaOk}
              onClick={() => {
                if (!cargaOk) return
                setResumenFiltro((prev) => (prev === key ? null : key))
              }}
              style={{
                textAlign: 'left',
                background: active ? `${color}22` : t.bgCard,
                border: `1px solid ${active ? color : t.border}`,
                borderRadius: 10,
                padding: '10px 12px',
                cursor: cargaOk ? 'pointer' : 'default',
                color: t.text,
                opacity: cargaOk ? 1 : 0.7,
              }}
            >
              <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>
                {label}
              </div>
              <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 900, color, marginTop: 2 }}>
                {block ? (block.cantidad ?? 0) : '—'}
              </div>
              <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 2 }}>
                {block ? fmtValorCop(block.valor) : '—'}
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
              {syncing ? 'Sincronizando análisis…' : 'Cargando hallazgos…'}
            </span>
          )}
          {!loading && !syncing && mostrandoGuardados && (
            <span style={{ color: '#b45309', fontSize: 'var(--cc-caption)' }}>
              {(() => {
                const cuando = fmtFechaHallazgosGuardados(hallazgosActualizadoEn)
                return cuando
                  ? `Mostrando hallazgos guardados del ${cuando}`
                  : 'Mostrando hallazgos guardados (sin sincronizar)'
              })()}
            </span>
          )}
          {!loading && !syncing && !mostrandoGuardados && hallazgosActualizadoEn && (
            <span style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
              Actualizados {fmtFechaHallazgosGuardados(hallazgosActualizadoEn)}
            </span>
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
            disabled={syncing || loading}
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
            disabled={exportando || !filtrados.length || !cargaOk}
            style={{
              background: t.primary,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '6px 10px',
              fontWeight: 700,
              cursor: filtrados.length && cargaOk ? 'pointer' : 'not-allowed',
              fontSize: 'var(--cc-caption)',
              opacity: filtrados.length && cargaOk ? 1 : 0.5,
            }}
          >
            {exportando ? 'Exportando…' : 'Excel'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            background: '#dc262612',
            border: '1px solid #dc262655',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          <span style={{ color: '#dc2626', fontSize: 'var(--cc-sm)', flex: '1 1 220px' }}>
            {error}
          </span>
          <button
            type="button"
            onClick={() => cargar({ sincronizar: true })}
            disabled={loading || syncing}
            style={{
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '6px 12px',
              fontWeight: 800,
              cursor: loading || syncing ? 'wait' : 'pointer',
              fontSize: 'var(--cc-caption)',
            }}
          >
            Reintentar
          </button>
        </div>
      )}

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
          <table style={{ ...sheet.sheetTable, minWidth: 720 }}>
            <thead>
              <tr>
                {thBtn('tipo', 'Tipo', 100)}
                {thBtn('item_numero', 'Ítem', 70)}
                {thBtn('tramo', 'Tramo', 90)}
                {thBtn('infraestructura', 'Infraestructura', 110)}
                {thBtn('ubicacion', 'Ubicación', 140)}
                {thBtn('medida_m', 'Medida', 80)}
                {thBtn('registros', 'Registros', 140)}
                {thBtn('valor_en_juego', 'Valor en juego', 110)}
                {thBtn('justificacion', 'Justificación', 140)}
              </tr>
              <tr>
                {[
                  'tipo', 'item_numero', 'tramo', 'infraestructura', 'ubicacion',
                  'medida_m', 'registros', 'valor_en_juego', 'justificacion',
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
              {!cargaOk && !loading && error ? (
                <tr>
                  <td colSpan={9} style={{ ...sheet.td, textAlign: 'center', color: '#dc2626' }}>
                    No se pudieron cargar los hallazgos. Use Reintentar.
                  </td>
                </tr>
              ) : !filtrados.length ? (
                <tr>
                  <td colSpan={9} style={{ ...sheet.td, textAlign: 'center', color: t.textMuted }}>
                    {loading || syncing
                      ? 'Analizando hallazgos del contrato…'
                      : cargaOk
                        ? 'Sin hallazgos con los filtros actuales'
                        : 'Cargando hallazgos…'}
                  </td>
                </tr>
              ) : grupos ? (
                grupos.map(([nombre, rows]) => (
                  <Fragment key={`g-${nombre}`}>
                    <tr>
                      <td
                        colSpan={9}
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
                {' '}· seleccione un hallazgo
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
              filterItemNumeros: filterItemNumeros.length ? filterItemNumeros : null,
              filterRegistroIds,
            })
          ) : (
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)', padding: 12 }}>
              Mapa no disponible en este contexto.
            </div>
          )}
          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
            Base: eje y abscisado. Los dibujos aparecen solo al seleccionar un hallazgo
            en la tabla, con el color estándar de su ítem.
          </div>
        </div>
      </div>

      {seleccionado && (
        <SicoeHallazgoDetalle
          t={t}
          hallazgo={seleccionado}
          hallazgosLista={filtrados}
          API_URL={API_URL}
          contratoId={contratoId}
          token={token}
          isNarrow={isNarrow}
          onCerrar={() => setSeleccionadoId(null)}
          onSeleccionarHallazgo={(h) => {
            if (h?.id != null) setSeleccionadoId(h.id)
          }}
          onAbrirRegistro={(r) => {
            if (!onAbrirRegistro || !r) return
            onAbrirRegistro({
              id: r.id,
              reporte_id: r.reporte_id,
              numero_registro: r.numero_registro,
              item_numero: r.item_numero || seleccionado.item_numero,
            })
          }}
          onJustificado={async () => {
            await cargar({ sincronizar: false })
          }}
        />
      )}

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
