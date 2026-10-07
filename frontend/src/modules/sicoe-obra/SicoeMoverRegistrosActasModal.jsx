/**
 * Herramienta exclusiva Desarrollador: mover/reasignar registros.
 * TABs: Entre actas | Entre cortes de subcontratista | Reasignar entre subcontratistas.
 * Presentación tipo hoja Excel (pptoSheetStyles) + Shift+clic rango (reasignar).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pptoSheetCssVars, pptoSheetStyles } from '../presupuesto/pptoSheetStyles'
import { idsRangoSeleccion } from '../presupuesto/pptoSeleccionRango'
import SicoeFiltroModal from './SicoeFiltroModal'
import { sicoeBundleTieneCriteriosUsuario } from './sicoeFiltroCatalogo'
import { sicoeBundleToReasignarPayload } from './sicoeMoverReasignarPayload'

const CONFIRM_SELLADOS = 'INCLUIR-SELLADOS'
/** Sentinel UI: registros del subcontratista con corte_id nulo. */
const CORTE_ORIGEN_SIN = 'sin'
const TABS = [
  { id: 'actas', label: 'Entre actas' },
  { id: 'cortes', label: 'Entre cortes de subcontratista' },
  { id: 'reasignar', label: 'Reasignar entre subcontratistas' },
]

function labelActa(a) {
  if (!a) return '—'
  if (a.label) return a.label
  if (a.numero_rpo != null) return `Acta RPO ${a.numero_rpo}`
  return `Acta #${a.id}`
}

function labelCorte(c) {
  if (!c) return '—'
  if (c.sin_corte) return c.label || 'Sin corte'
  if (c.label) return c.label
  if (c.consecutivo != null) return `Corte #${c.consecutivo}`
  return `Corte #${c.id}`
}

/** Payload API: null = Sin corte; número = id de corte. */
function corteOrigenIdPayload(origenCorte) {
  if (origenCorte === CORTE_ORIGEN_SIN) return null
  if (origenCorte === '' || origenCorte == null) return undefined
  return Number(origenCorte)
}

function labelSub(s) {
  if (!s) return '—'
  if (s.label) return s.label
  return (s.razon_social || '').trim() || `Sub #${s.id}`
}

function SheetTable({ sheet, columns, rows, emptyMsg, maxHeight = 320 }) {
  return (
    <div style={{ ...sheet.sheetWrap, maxHeight, overflow: 'auto' }}>
      <table style={{ ...sheet.sheetTable, minWidth: 520 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ ...sheet.th, width: c.width, textAlign: c.align || 'left' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ ...sheet.tdMuted, textAlign: 'center', padding: 16 }}>
                {emptyMsg || 'Sin registros.'}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.key}
                onClick={row.onRowClick}
                style={{
                  background: row.bg || 'transparent',
                  opacity: row.opacity ?? 1,
                  cursor: row.onRowClick ? 'pointer' : undefined,
                }}
              >
                {row.cells.map((cell, i) => (
                  <td
                    key={columns[i].key}
                    style={{
                      ...(cell.muted ? sheet.tdMuted : sheet.td),
                      textAlign: columns[i].align || 'left',
                      ...(cell.style || {}),
                    }}
                    onClick={cell.onClick}
                  >
                    {cell.node}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function SelladosConfirm({ confirmarSellados, setConfirmarSellados, regsPreview, setSeleccion, totSellados }) {
  if (!totSellados) return null
  return (
    <label style={{
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
      padding: 10,
      borderRadius: 4,
      background: 'rgba(234,179,8,0.12)',
      border: '1px solid rgba(234,179,8,0.45)',
      fontSize: 'var(--cc-sm)',
      lineHeight: 1.45,
    }}>
      <input
        type="checkbox"
        checked={confirmarSellados}
        onChange={(e) => {
          const on = e.target.checked
          setConfirmarSellados(on)
          if (!on) {
            setSeleccion((prev) => {
              const next = new Set(prev)
              regsPreview.filter((r) => r.sellado).forEach((r) => next.delete(r.id))
              return next
            })
          }
        }}
        style={{ marginTop: 3 }}
      />
      <span>
        <strong>Confirmo incluir registros ya aprobados (sellados/bloqueados).</strong>
        {' '}Por defecto no se mueven. Debe marcar esta casilla y luego seleccionarlos.
        Confirmación técnica: <code>{CONFIRM_SELLADOS}</code>.
      </span>
    </label>
  )
}

function ResultadoPanel({ t, sheet, titulo, resumen, movidos, noMovidos, colsExtra }) {
  const cols = [
    { key: 'reg', label: 'Reg.', width: 72 },
    ...(colsExtra || []),
    { key: 'nota', label: 'Nota', width: 120 },
  ]
  const rows = [
    ...(movidos || []).map((r) => ({
      key: `m-${r.id}`,
      cells: [
        { node: `#${r.numero_registro ?? r.id}` },
        ...(colsExtra || []).map((c) => ({ node: c.render?.(r) ?? '—', muted: true })),
        { node: r.sellado ? 'Sellado incluido' : 'OK', muted: true },
      ],
    })),
    ...(noMovidos || []).map((r) => ({
      key: `n-${r.id}`,
      cells: [
        { node: `#${r.numero_registro ?? r.id}` },
        ...(colsExtra || []).map(() => ({ node: '—', muted: true })),
        { node: 'Sin mover', style: { color: '#b91c1c' } },
      ],
    })),
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        padding: 12,
        borderRadius: 4,
        background: 'rgba(22,163,74,0.1)',
        border: '1px solid rgba(22,163,74,0.35)',
      }}>
        <div style={{ fontWeight: 900, fontSize: 'var(--cc-md)', color: '#15803d' }}>{titulo}</div>
        <div style={{ marginTop: 6, fontSize: 'var(--cc-sm)', color: t.text, lineHeight: 1.5 }}>{resumen}</div>
      </div>
      <SheetTable sheet={sheet} columns={cols} rows={rows} emptyMsg="Sin detalle." />
    </div>
  )
}

export default function SicoeMoverRegistrosActasModal({
  t,
  API_URL,
  token,
  contratoId,
  contratoLabel,
  onClose,
  onDone,
  filtroSubcList = [],
  pkList = [],
  estadosReporte = [],
  etiquetasValidacion = [],
  nivelesDisponibles = [1, 2, 3],
  encabezadoPorNivel = {},
  estiloChipCapa,
  avisoCapasY,
  puedeVerSubcontratista = true,
}) {
  const hdrs = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  )
  const sheet = useMemo(() => pptoSheetStyles(t), [t])
  const sheetVars = useMemo(() => pptoSheetCssVars(t), [t])

  const [tab, setTab] = useState('actas')
  const [error, setError] = useState(null)

  // ── Actas ──
  const [pasoActas, setPasoActas] = useState('seleccion')
  const [actas, setActas] = useState([])
  const [origenActa, setOrigenActa] = useState('')
  const [destinoActa, setDestinoActa] = useState('')
  const [cargandoActas, setCargandoActas] = useState(true)
  const [cargandoPreviewActas, setCargandoPreviewActas] = useState(false)
  const [ejecutandoActas, setEjecutandoActas] = useState(false)
  const [previewActas, setPreviewActas] = useState(null)
  const [selActas, setSelActas] = useState(() => new Set())
  const [confSellActas, setConfSellActas] = useState(false)
  const [motivoActas, setMotivoActas] = useState('')
  const [resultadoActas, setResultadoActas] = useState(null)

  // ── Cortes ──
  const [pasoCortes, setPasoCortes] = useState('seleccion')
  const [subs, setSubs] = useState([])
  const [subId, setSubId] = useState('')
  const [cortes, setCortes] = useState([])
  const [origenCorte, setOrigenCorte] = useState('')
  const [destinoCorte, setDestinoCorte] = useState('')
  const [cargandoSubs, setCargandoSubs] = useState(true)
  const [cargandoCortes, setCargandoCortes] = useState(false)
  const [cargandoPreviewCortes, setCargandoPreviewCortes] = useState(false)
  const [ejecutandoCortes, setEjecutandoCortes] = useState(false)
  const [previewCortes, setPreviewCortes] = useState(null)
  const [selCortes, setSelCortes] = useState(() => new Set())
  const [confSellCortes, setConfSellCortes] = useState(false)
  const [motivoCortes, setMotivoCortes] = useState('')
  const [resultadoCortes, setResultadoCortes] = useState(null)

  // ── Reasignar ──
  const [pasoReas, setPasoReas] = useState('filtros')
  const [filtroOpen, setFiltroOpen] = useState(false)
  const [bundleFiltro, setBundleFiltro] = useState(null)
  const [cargandoBuscar, setCargandoBuscar] = useState(false)
  const [ejecutandoReas, setEjecutandoReas] = useState(false)
  const [regsReas, setRegsReas] = useState([])
  const [truncadoReas, setTruncadoReas] = useState(false)
  const [topeReas, setTopeReas] = useState(2000)
  const [selReas, setSelReas] = useState(() => new Set())
  const [confSellReas, setConfSellReas] = useState(false)
  const [subDestinoId, setSubDestinoId] = useState('')
  const [motivoReas, setMotivoReas] = useState('')
  const [resultadoReas, setResultadoReas] = useState(null)
  const lastSelAnchorRef = useRef(null)

  const selectSt = {
    width: '100%',
    background: t.bg,
    color: t.text,
    border: `1px solid ${sheet.border}`,
    borderRadius: 4,
    padding: '8px 10px',
    fontSize: 'var(--cc-sm)',
  }
  const btnPrimary = {
    background: t.primary,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    fontWeight: 800,
    fontSize: 'var(--cc-sm)',
    cursor: 'pointer',
  }
  const btnGhost = {
    background: 'transparent',
    color: t.textMuted,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '10px 16px',
    fontWeight: 700,
    fontSize: 'var(--cc-sm)',
    cursor: 'pointer',
  }

  // Load actas
  useEffect(() => {
    if (!contratoId) return
    let cancel = false
    setCargandoActas(true)
    fetch(`${API_URL}/sicoe-obra/${contratoId}/actas-rpo`, { headers: hdrs })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(typeof j?.detail === 'string' ? j.detail : `Error ${r.status}`)
        return j
      })
      .then((j) => { if (!cancel) setActas(Array.isArray(j.actas) ? j.actas : []) })
      .catch((e) => { if (!cancel) setError(e?.message || String(e)) })
      .finally(() => { if (!cancel) setCargandoActas(false) })
    return () => { cancel = true }
  }, [API_URL, contratoId, hdrs])

  // Load subs
  useEffect(() => {
    if (!contratoId) return
    let cancel = false
    setCargandoSubs(true)
    fetch(`${API_URL}/sicoe-obra/${contratoId}/dev/subcontratistas`, { headers: hdrs })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(typeof j?.detail === 'string' ? j.detail : `Error ${r.status}`)
        return j
      })
      .then((j) => { if (!cancel) setSubs(Array.isArray(j.subcontratistas) ? j.subcontratistas : []) })
      .catch((e) => { if (!cancel) setError(e?.message || String(e)) })
      .finally(() => { if (!cancel) setCargandoSubs(false) })
    return () => { cancel = true }
  }, [API_URL, contratoId, hdrs])

  // Load cortes when sub changes
  useEffect(() => {
    if (!contratoId || !subId) {
      setCortes([])
      setOrigenCorte('')
      setDestinoCorte('')
      return
    }
    let cancel = false
    setCargandoCortes(true)
    setOrigenCorte('')
    setDestinoCorte('')
    fetch(`${API_URL}/sicoe-obra/${contratoId}/dev/subcontratistas/${subId}/cortes`, { headers: hdrs })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(typeof j?.detail === 'string' ? j.detail : `Error ${r.status}`)
        return j
      })
      .then((j) => { if (!cancel) setCortes(Array.isArray(j.cortes) ? j.cortes : []) })
      .catch((e) => { if (!cancel) setError(e?.message || String(e)) })
      .finally(() => { if (!cancel) setCargandoCortes(false) })
    return () => { cancel = true }
  }, [API_URL, contratoId, hdrs, subId])

  const switchTab = (id) => {
    setTab(id)
    setError(null)
  }

  // ── Actas handlers ──
  const regsPrevActas = previewActas?.registros || []
  const nSelActas = selActas.size
  const nSellActas = useMemo(
    () => regsPrevActas.filter((r) => selActas.has(r.id) && r.sellado).length,
    [regsPrevActas, selActas],
  )

  const cargarPreviewActas = useCallback(async () => {
    setError(null)
    if (!origenActa || !destinoActa) {
      setError('Seleccione acta de origen y de destino.')
      return
    }
    if (String(origenActa) === String(destinoActa)) {
      setError('Origen y destino deben ser distintas.')
      return
    }
    setCargandoPreviewActas(true)
    try {
      const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/registros/mover-entre-actas/preview`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          acta_origen_id: Number(origenActa),
          acta_destino_id: Number(destinoActa),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j?.detail === 'string' ? j.detail : `Error ${res.status}`)
      setPreviewActas(j)
      setSelActas(new Set((j.registros || []).filter((r) => r.seleccionable_por_defecto).map((r) => r.id)))
      setConfSellActas(false)
      setPasoActas('preview')
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setCargandoPreviewActas(false)
    }
  }, [API_URL, contratoId, destinoActa, hdrs, origenActa])

  const ejecutarActas = async () => {
    setError(null)
    if (nSelActas < 1) { setError('Seleccione al menos un registro.'); return }
    if (nSellActas > 0 && !confSellActas) {
      setError('Hay registros sellados seleccionados: confirme su inclusión.')
      return
    }
    setEjecutandoActas(true)
    try {
      const body = {
        acta_origen_id: Number(origenActa),
        acta_destino_id: Number(destinoActa),
        registro_ids: [...selActas],
        incluir_sellados: nSellActas > 0,
        motivo: (motivoActas || '').trim() || null,
      }
      if (nSellActas > 0) body.confirmacion_sellados = CONFIRM_SELLADOS
      const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/registros/mover-entre-actas`, {
        method: 'POST', headers: hdrs, body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j?.detail === 'string' ? j.detail : `Error ${res.status}`)
      setResultadoActas(j)
      setPasoActas('resultado')
      onDone?.(j)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setEjecutandoActas(false)
    }
  }

  // ── Cortes handlers ──
  const regsPrevCortes = previewCortes?.registros || []
  const nSelCortes = selCortes.size
  const nSellCortes = useMemo(
    () => regsPrevCortes.filter((r) => selCortes.has(r.id) && r.sellado).length,
    [regsPrevCortes, selCortes],
  )

  const cargarPreviewCortes = useCallback(async () => {
    setError(null)
    const origenId = corteOrigenIdPayload(origenCorte)
    if (!subId || origenId === undefined || !destinoCorte) {
      setError('Seleccione subcontratista, corte de origen y de destino.')
      return
    }
    if (origenCorte !== CORTE_ORIGEN_SIN && String(origenCorte) === String(destinoCorte)) {
      setError('Origen y destino deben ser distintos.')
      return
    }
    setCargandoPreviewCortes(true)
    try {
      const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/registros/mover-entre-cortes/preview`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          subcontratista_id: Number(subId),
          corte_origen_id: origenId,
          corte_destino_id: Number(destinoCorte),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j?.detail === 'string' ? j.detail : `Error ${res.status}`)
      setPreviewCortes(j)
      setSelCortes(new Set((j.registros || []).filter((r) => r.seleccionable_por_defecto).map((r) => r.id)))
      setConfSellCortes(false)
      setPasoCortes('preview')
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setCargandoPreviewCortes(false)
    }
  }, [API_URL, contratoId, destinoCorte, hdrs, origenCorte, subId])

  const ejecutarCortes = async () => {
    setError(null)
    if (nSelCortes < 1) { setError('Seleccione al menos un registro.'); return }
    if (nSellCortes > 0 && !confSellCortes) {
      setError('Hay registros sellados seleccionados: confirme su inclusión.')
      return
    }
    const origenId = corteOrigenIdPayload(origenCorte)
    if (origenId === undefined || !destinoCorte) {
      setError('Seleccione corte de origen y de destino.')
      return
    }
    setEjecutandoCortes(true)
    try {
      const body = {
        subcontratista_id: Number(subId),
        corte_origen_id: origenId,
        corte_destino_id: Number(destinoCorte),
        registro_ids: [...selCortes],
        incluir_sellados: nSellCortes > 0,
        motivo: (motivoCortes || '').trim() || null,
      }
      if (nSellCortes > 0) body.confirmacion_sellados = CONFIRM_SELLADOS
      const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/registros/mover-entre-cortes`, {
        method: 'POST', headers: hdrs, body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j?.detail === 'string' ? j.detail : `Error ${res.status}`)
      setResultadoCortes(j)
      setPasoCortes('resultado')
      onDone?.(j)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setEjecutandoCortes(false)
    }
  }

  // ── Reasignar handlers ──
  const nSelReas = selReas.size
  const nSellReas = useMemo(
    () => regsReas.filter((r) => selReas.has(r.id) && r.sellado).length,
    [regsReas, selReas],
  )
  const totSellReas = useMemo(() => regsReas.filter((r) => r.sellado).length, [regsReas])

  const buscarReasignar = useCallback(async (snap) => {
    setError(null)
    if (!sicoeBundleTieneCriteriosUsuario(snap)) {
      setError('Defina al menos un criterio de filtro.')
      return
    }
    setBundleFiltro(snap)
    setCargandoBuscar(true)
    try {
      const payload = sicoeBundleToReasignarPayload(snap)
      const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/registros/reasignar-subcontratista/buscar`, {
        method: 'POST', headers: hdrs, body: JSON.stringify(payload),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j?.detail === 'string' ? j.detail : `Error ${res.status}`)
      const regs = Array.isArray(j.registros) ? j.registros : []
      // Defensa FE: nunca mostrar costos si el backend los enviara por error.
      const safe = regs.map((r) => {
        const { costo_directo: _cd, valor_unitario: _vu, ...rest } = r || {}
        return rest
      })
      setRegsReas(safe)
      setTruncadoReas(!!j.truncado)
      setTopeReas(j.tope_registros || 2000)
      setSelReas(new Set(safe.filter((r) => r.seleccionable_por_defecto).map((r) => r.id)))
      setConfSellReas(false)
      lastSelAnchorRef.current = null
      setPasoReas('preview')
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setCargandoBuscar(false)
    }
  }, [API_URL, contratoId, hdrs])

  const toggleReas = (id, sellado, e) => {
    if (e?.shiftKey && lastSelAnchorRef.current != null) {
      e.preventDefault?.()
      const omitir = (row) => !!(row.sellado && !confSellReas)
      const ids = idsRangoSeleccion(regsReas, lastSelAnchorRef.current, id, omitir)
      setSelReas((prev) => {
        const next = new Set(prev)
        ids.forEach((x) => next.add(x))
        return next
      })
      return
    }
    setSelReas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else {
        if (sellado && !confSellReas) return prev
        next.add(id)
      }
      return next
    })
    if (!e?.shiftKey) lastSelAnchorRef.current = id
  }

  const ejecutarReas = async () => {
    setError(null)
    if (nSelReas < 1) { setError('Seleccione al menos un registro.'); return }
    if (!subDestinoId) { setError('Seleccione el subcontratista destino.'); return }
    if (nSellReas > 0 && !confSellReas) {
      setError('Hay registros sellados seleccionados: confirme su inclusión.')
      return
    }
    setEjecutandoReas(true)
    try {
      const body = {
        subcontratista_destino_id: Number(subDestinoId),
        registro_ids: [...selReas],
        incluir_sellados: nSellReas > 0,
        motivo: (motivoReas || '').trim() || null,
      }
      if (nSellReas > 0) body.confirmacion_sellados = CONFIRM_SELLADOS
      const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/registros/reasignar-subcontratista`, {
        method: 'POST', headers: hdrs, body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j?.detail === 'string' ? j.detail : `Error ${res.status}`)
      setResultadoReas(j)
      setPasoReas('resultado')
      onDone?.(j)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setEjecutandoReas(false)
    }
  }

  const toggleCheck = (setSel, confSell) => (id, sellado) => {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else {
        if (sellado && !confSell) return prev
        next.add(id)
      }
      return next
    })
  }

  const overlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    zIndex: 10080,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  }
  const card = {
    background: t.bgCard,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 14,
    width: 'min(980px, 100%)',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: t.shadow || '0 12px 40px rgba(0,0,0,0.35)',
    ...sheetVars,
  }

  const renderPreviewGrid = (regs, seleccion, confSell, onToggle, opts = {}) => {
    const cols = [
      { key: 'chk', label: '', width: 36 },
      { key: 'reg', label: 'Reg.', width: 72 },
      { key: 'item', label: 'Ítem' },
      ...(opts.extraCols || []),
      { key: 'est', label: 'Estado', width: 110 },
    ]
    const rows = regs.map((r) => {
      const disabledSellado = r.sellado && !confSell
      return {
        key: r.id,
        bg: r.sellado ? 'rgba(234,179,8,0.08)' : 'transparent',
        opacity: disabledSellado ? 0.65 : 1,
        onRowClick: opts.onRowClick ? (e) => opts.onRowClick(r, e) : undefined,
        cells: [
          {
            node: (
              <input
                type="checkbox"
                checked={seleccion.has(r.id)}
                disabled={disabledSellado}
                onChange={(e) => onToggle(r.id, r.sellado, e?.nativeEvent || e)}
                onClick={(e) => e.stopPropagation()}
                title={disabledSellado ? 'Confirme inclusión de sellados primero' : (opts.chkTitle || undefined)}
              />
            ),
          },
          { node: <strong>#{r.numero_registro ?? r.id}</strong> },
          {
            node: (
              <div>
                <div style={{ fontWeight: 600 }}>{r.item_numero || '—'}</div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
                  {r.item_descripcion || r.capitulo || ''}
                </div>
              </div>
            ),
          },
          ...(opts.extraCells ? opts.extraCells(r) : []),
          {
            node: r.sellado ? (
              <span style={{
                display: 'inline-block',
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(234,179,8,0.2)',
                color: '#92400e',
                fontWeight: 800,
                fontSize: 'var(--cc-caption)',
              }}>
                Sellado{r.bloqueado ? ' / bloqueado' : ''}
              </span>
            ) : (
              <span style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>Editable</span>
            ),
          },
        ],
      }
    })
    return (
      <SheetTable
        sheet={sheet}
        columns={cols}
        rows={rows}
        emptyMsg={opts.emptyMsg || 'No hay registros.'}
        maxHeight={opts.maxHeight || 360}
      />
    )
  }

  const footerActas = () => {
    if (pasoActas === 'seleccion') {
      return (
        <>
          <button type="button" onClick={onClose} style={btnGhost}>Cancelar</button>
          <button
            type="button"
            onClick={() => void cargarPreviewActas()}
            disabled={cargandoPreviewActas || cargandoActas || !origenActa || !destinoActa}
            style={{ ...btnPrimary, opacity: (cargandoPreviewActas || !origenActa || !destinoActa) ? 0.55 : 1 }}
          >
            {cargandoPreviewActas ? 'Cargando…' : 'Vista previa'}
          </button>
        </>
      )
    }
    if (pasoActas === 'preview') {
      return (
        <>
          <button type="button" onClick={() => { setPasoActas('seleccion'); setError(null) }} style={btnGhost} disabled={ejecutandoActas}>Atrás</button>
          <button type="button" onClick={() => void ejecutarActas()} disabled={ejecutandoActas || nSelActas < 1} style={{ ...btnPrimary, opacity: (ejecutandoActas || nSelActas < 1) ? 0.55 : 1 }}>
            {ejecutandoActas ? 'Moviendo…' : `Confirmar movimiento (${nSelActas})`}
          </button>
        </>
      )
    }
    return <button type="button" onClick={onClose} style={btnPrimary}>Cerrar</button>
  }

  const footerCortes = () => {
    if (pasoCortes === 'seleccion') {
      return (
        <>
          <button type="button" onClick={onClose} style={btnGhost}>Cancelar</button>
          <button
            type="button"
            onClick={() => void cargarPreviewCortes()}
            disabled={cargandoPreviewCortes || !subId || !origenCorte || !destinoCorte}
            style={{ ...btnPrimary, opacity: (cargandoPreviewCortes || !subId || !origenCorte || !destinoCorte) ? 0.55 : 1 }}
          >
            {cargandoPreviewCortes ? 'Cargando…' : 'Vista previa'}
          </button>
        </>
      )
    }
    if (pasoCortes === 'preview') {
      return (
        <>
          <button type="button" onClick={() => { setPasoCortes('seleccion'); setError(null) }} style={btnGhost} disabled={ejecutandoCortes}>Atrás</button>
          <button type="button" onClick={() => void ejecutarCortes()} disabled={ejecutandoCortes || nSelCortes < 1} style={{ ...btnPrimary, opacity: (ejecutandoCortes || nSelCortes < 1) ? 0.55 : 1 }}>
            {ejecutandoCortes ? 'Moviendo…' : `Confirmar movimiento (${nSelCortes})`}
          </button>
        </>
      )
    }
    return <button type="button" onClick={onClose} style={btnPrimary}>Cerrar</button>
  }

  const footerReas = () => {
    if (pasoReas === 'filtros') {
      return (
        <>
          <button type="button" onClick={onClose} style={btnGhost}>Cancelar</button>
          <button type="button" onClick={() => setFiltroOpen(true)} style={btnPrimary} disabled={cargandoBuscar}>
            {cargandoBuscar ? 'Buscando…' : 'Abrir filtros'}
          </button>
        </>
      )
    }
    if (pasoReas === 'preview') {
      return (
        <>
          <button type="button" onClick={() => { setPasoReas('filtros'); setError(null) }} style={btnGhost} disabled={ejecutandoReas}>Atrás</button>
          <button type="button" onClick={() => setFiltroOpen(true)} style={btnGhost} disabled={ejecutandoReas || cargandoBuscar}>Cambiar filtros</button>
          <button type="button" onClick={() => void ejecutarReas()} disabled={ejecutandoReas || nSelReas < 1 || !subDestinoId} style={{ ...btnPrimary, opacity: (ejecutandoReas || nSelReas < 1 || !subDestinoId) ? 0.55 : 1 }}>
            {ejecutandoReas ? 'Reasignando…' : `Confirmar reasignación (${nSelReas})`}
          </button>
        </>
      )
    }
    return <button type="button" onClick={onClose} style={btnPrimary}>Cerrar</button>
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="sicoe-mover-dev-title">
      <div style={card}>
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div>
            <div id="sicoe-mover-dev-title" style={{ fontWeight: 900, fontSize: 'var(--cc-h1)', color: t.text }}>
              Mover / reasignar registros
            </div>
            <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 2 }}>
              Solo Desarrollador · {contratoLabel || `Contrato #${contratoId}`}
            </div>
          </div>
          <button type="button" onClick={onClose} style={btnGhost} aria-label="Cerrar">✕</button>
        </div>

        <div style={{
          display: 'flex',
          gap: 0,
          borderBottom: `1px solid ${t.border}`,
          padding: '0 12px',
          overflowX: 'auto',
        }} role="tablist">
          {TABS.map((tb) => {
            const active = tab === tb.id
            return (
              <button
                key={tb.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(tb.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? `2px solid ${t.primary}` : '2px solid transparent',
                  color: active ? t.primary : t.textMuted,
                  fontWeight: active ? 900 : 700,
                  fontSize: 'var(--cc-caption)',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {tb.label}
              </button>
            )
          })}
        </div>

        <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 4,
              background: 'rgba(220,38,38,0.12)',
              border: '1px solid rgba(220,38,38,0.4)',
              color: '#b91c1c',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
            }}>
              {error}
            </div>
          )}

          {/* ═══════ TAB ACTAS ═══════ */}
          {tab === 'actas' && pasoActas === 'seleccion' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, color: t.textMuted, fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
                Elija el acta RPO de origen y la de destino. El acta original se conserva en{' '}
                <code>acta_rpo_id_backup_swap</code>.
              </p>
              {cargandoActas ? (
                <div style={{ color: t.textMuted }}>Cargando actas…</div>
              ) : (
                <div style={sheet.sheetWrap}>
                  <table style={{ ...sheet.sheetTable, minWidth: 480 }}>
                    <tbody>
                      <tr>
                        <td style={sheet.tdLabel}>Acta de origen</td>
                        <td style={sheet.td}>
                          <select value={origenActa} onChange={(e) => setOrigenActa(e.target.value)} style={selectSt}>
                            <option value="">— Seleccionar —</option>
                            {actas.map((a) => (
                              <option key={a.id} value={a.id}>{labelActa(a)}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                      <tr>
                        <td style={sheet.tdLabel}>Acta de destino</td>
                        <td style={sheet.td}>
                          <select value={destinoActa} onChange={(e) => setDestinoActa(e.target.value)} style={selectSt}>
                            <option value="">— Seleccionar —</option>
                            {actas.map((a) => (
                              <option key={a.id} value={a.id} disabled={String(a.id) === String(origenActa)}>
                                {labelActa(a)}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'actas' && pasoActas === 'preview' && previewActas && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={sheet.sheetWrap}>
                <table style={{ ...sheet.sheetTable, minWidth: 480 }}>
                  <tbody>
                    <tr>
                      <td style={sheet.tdLabel}>Origen</td>
                      <td style={sheet.td}><strong>{labelActa(previewActas.acta_origen)}</strong></td>
                      <td style={sheet.tdLabel}>Destino</td>
                      <td style={sheet.td}><strong>{labelActa(previewActas.acta_destino)}</strong></td>
                    </tr>
                    <tr>
                      <td style={sheet.tdLabel}>Seleccionados</td>
                      <td style={sheet.td}>{nSelActas} / {previewActas.totales?.total ?? 0}</td>
                      <td style={sheet.tdLabel}>Sellados en selección</td>
                      <td style={{ ...sheet.td, color: nSellActas ? '#b45309' : undefined, fontWeight: 800 }}>{nSellActas}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" onClick={() => setSelActas(new Set(regsPrevActas.filter((r) => !r.sellado).map((r) => r.id)))} style={btnGhost}>Marcar no sellados</button>
                <button type="button" onClick={() => setSelActas(new Set())} style={btnGhost}>Desmarcar todos</button>
              </div>
              <SelladosConfirm
                confirmarSellados={confSellActas}
                setConfirmarSellados={setConfSellActas}
                regsPreview={regsPrevActas}
                setSeleccion={setSelActas}
                totSellados={previewActas.totales?.sellados}
              />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 'var(--cc-label)', fontWeight: 800, color: t.textMuted }}>Motivo (opcional, auditoría)</span>
                <input value={motivoActas} onChange={(e) => setMotivoActas(e.target.value)} placeholder="Ej. Acta vencida — traslado a RPO vigente" style={{ ...selectSt, boxSizing: 'border-box' }} />
              </label>
              {renderPreviewGrid(regsPrevActas, selActas, confSellActas, toggleCheck(setSelActas, confSellActas), { emptyMsg: 'No hay registros en el acta de origen.' })}
              {previewActas.truncado && (
                <div style={{ fontSize: 'var(--cc-caption)', color: '#b45309', fontWeight: 700 }}>
                  Vista limitada a {previewActas.tope_registros} registros.
                </div>
              )}
            </div>
          )}

          {tab === 'actas' && pasoActas === 'resultado' && resultadoActas && (
            <ResultadoPanel
              t={t}
              sheet={sheet}
              titulo="Movimiento entre actas completado"
              resumen={
                <>
                  {resultadoActas.totales?.movidos ?? 0} registro(s) de{' '}
                  <strong>{labelActa(resultadoActas.acta_origen)}</strong>
                  {' → '}
                  <strong>{labelActa(resultadoActas.acta_destino)}</strong>
                  {(resultadoActas.totales?.no_movidos || 0) > 0 && <> · {resultadoActas.totales.no_movidos} sin mover</>}
                </>
              }
              movidos={resultadoActas.movidos}
              noMovidos={resultadoActas.no_movidos}
              colsExtra={[
                { key: 'de', label: 'De', render: () => labelActa(resultadoActas.acta_origen) },
                { key: 'a', label: 'A', render: () => labelActa(resultadoActas.acta_destino) },
              ]}
            />
          )}

          {/* ═══════ TAB CORTES ═══════ */}
          {tab === 'cortes' && pasoCortes === 'seleccion' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, color: t.textMuted, fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
                Seleccione el subcontratista y luego los cortes de origen y destino (del mismo sub).
                El origen incluye la opción «Sin corte» para cantidades de ese subcontratista que aún no tienen número de corte.
              </p>
              {cargandoSubs ? (
                <div style={{ color: t.textMuted }}>Cargando subcontratistas…</div>
              ) : (
                <div style={sheet.sheetWrap}>
                  <table style={{ ...sheet.sheetTable, minWidth: 480 }}>
                    <tbody>
                      <tr>
                        <td style={sheet.tdLabel}>Subcontratista</td>
                        <td style={sheet.td}>
                          <select value={subId} onChange={(e) => setSubId(e.target.value)} style={selectSt}>
                            <option value="">— Seleccionar —</option>
                            {subs.map((s) => (
                              <option key={s.id} value={s.id}>{labelSub(s)}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                      <tr>
                        <td style={sheet.tdLabel}>Corte de origen</td>
                        <td style={sheet.td}>
                          {cargandoCortes ? (
                            <span style={{ color: t.textMuted }}>Cargando cortes…</span>
                          ) : (
                            <select value={origenCorte} onChange={(e) => setOrigenCorte(e.target.value)} style={selectSt} disabled={!subId}>
                              <option value="">— Seleccionar —</option>
                              <option value={CORTE_ORIGEN_SIN}>Sin corte</option>
                              {cortes.map((c) => (
                                <option key={c.id} value={c.id}>{labelCorte(c)}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td style={sheet.tdLabel}>Corte de destino</td>
                        <td style={sheet.td}>
                          <select value={destinoCorte} onChange={(e) => setDestinoCorte(e.target.value)} style={selectSt} disabled={!subId}>
                            <option value="">— Seleccionar —</option>
                            {cortes.map((c) => (
                              <option
                                key={c.id}
                                value={c.id}
                                disabled={origenCorte !== CORTE_ORIGEN_SIN && String(c.id) === String(origenCorte)}
                              >
                                {labelCorte(c)}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'cortes' && pasoCortes === 'preview' && previewCortes && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={sheet.sheetWrap}>
                <table style={{ ...sheet.sheetTable, minWidth: 480 }}>
                  <tbody>
                    <tr>
                      <td style={sheet.tdLabel}>Subcontratista</td>
                      <td style={sheet.td} colSpan={3}><strong>{labelSub(previewCortes.subcontratista)}</strong></td>
                    </tr>
                    <tr>
                      <td style={sheet.tdLabel}>Origen</td>
                      <td style={sheet.td}><strong>{labelCorte(previewCortes.corte_origen)}</strong></td>
                      <td style={sheet.tdLabel}>Destino</td>
                      <td style={sheet.td}><strong>{labelCorte(previewCortes.corte_destino)}</strong></td>
                    </tr>
                    <tr>
                      <td style={sheet.tdLabel}>Seleccionados</td>
                      <td style={sheet.td}>{nSelCortes} / {previewCortes.totales?.total ?? 0}</td>
                      <td style={sheet.tdLabel}>Sellados en selección</td>
                      <td style={{ ...sheet.td, color: nSellCortes ? '#b45309' : undefined, fontWeight: 800 }}>{nSellCortes}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" onClick={() => setSelCortes(new Set(regsPrevCortes.filter((r) => !r.sellado).map((r) => r.id)))} style={btnGhost}>Marcar no sellados</button>
                <button type="button" onClick={() => setSelCortes(new Set())} style={btnGhost}>Desmarcar todos</button>
              </div>
              <SelladosConfirm
                confirmarSellados={confSellCortes}
                setConfirmarSellados={setConfSellCortes}
                regsPreview={regsPrevCortes}
                setSeleccion={setSelCortes}
                totSellados={previewCortes.totales?.sellados}
              />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 'var(--cc-label)', fontWeight: 800, color: t.textMuted }}>Motivo (opcional, auditoría)</span>
                <input value={motivoCortes} onChange={(e) => setMotivoCortes(e.target.value)} placeholder="Ej. Traslado a corte vigente" style={{ ...selectSt, boxSizing: 'border-box' }} />
              </label>
              {renderPreviewGrid(
                regsPrevCortes,
                selCortes,
                confSellCortes,
                toggleCheck(setSelCortes, confSellCortes),
                {
                  emptyMsg: previewCortes.corte_origen?.sin_corte
                    ? 'No hay registros sin corte asignado para este subcontratista.'
                    : 'No hay registros en el corte de origen.',
                },
              )}
              {previewCortes.truncado && (
                <div style={{ fontSize: 'var(--cc-caption)', color: '#b45309', fontWeight: 700 }}>
                  Vista limitada a {previewCortes.tope_registros} registros.
                </div>
              )}
            </div>
          )}

          {tab === 'cortes' && pasoCortes === 'resultado' && resultadoCortes && (
            <ResultadoPanel
              t={t}
              sheet={sheet}
              titulo="Movimiento entre cortes completado"
              resumen={
                <>
                  {resultadoCortes.totales?.movidos ?? 0} registro(s) de{' '}
                  <strong>{labelCorte(resultadoCortes.corte_origen)}</strong>
                  {' → '}
                  <strong>{labelCorte(resultadoCortes.corte_destino)}</strong>
                  {' · '}{labelSub(resultadoCortes.subcontratista)}
                  {(resultadoCortes.totales?.no_movidos || 0) > 0 && <> · {resultadoCortes.totales.no_movidos} sin mover</>}
                </>
              }
              movidos={resultadoCortes.movidos}
              noMovidos={resultadoCortes.no_movidos}
              colsExtra={[
                { key: 'de', label: 'De', render: () => labelCorte(resultadoCortes.corte_origen) },
                { key: 'a', label: 'A', render: () => labelCorte(resultadoCortes.corte_destino) },
              ]}
            />
          )}

          {/* ═══════ TAB REASIGNAR ═══════ */}
          {tab === 'reasignar' && pasoReas === 'filtros' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, color: t.textMuted, fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
                Use el mismo botón de filtros de SICOE Obra para acotar los registros individuales a reasignar.
                Los valores económicos de un subcontratista no se exponen durante el proceso.
              </p>
              <div style={sheet.sheetWrap}>
                <table style={{ ...sheet.sheetTable, minWidth: 400 }}>
                  <tbody>
                    <tr>
                      <td style={sheet.tdLabel}>Filtros</td>
                      <td style={sheet.td}>
                        <button type="button" onClick={() => setFiltroOpen(true)} style={btnPrimary} disabled={cargandoBuscar}>
                          {cargandoBuscar ? 'Buscando…' : '🔍 Filtros SICOE Obra'}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'reasignar' && pasoReas === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={sheet.sheetWrap}>
                <table style={{ ...sheet.sheetTable, minWidth: 480 }}>
                  <tbody>
                    <tr>
                      <td style={sheet.tdLabel}>Encontrados</td>
                      <td style={sheet.td}>{regsReas.length}{truncadoReas ? ` (tope ${topeReas})` : ''}</td>
                      <td style={sheet.tdLabel}>Seleccionados</td>
                      <td style={sheet.td}>{nSelReas}</td>
                    </tr>
                    <tr>
                      <td style={sheet.tdLabel}>Sellados en selección</td>
                      <td style={{ ...sheet.td, color: nSellReas ? '#b45309' : undefined, fontWeight: 800 }}>{nSellReas}</td>
                      <td style={sheet.tdLabel}>Sub. destino</td>
                      <td style={sheet.td}>
                        <select value={subDestinoId} onChange={(e) => setSubDestinoId(e.target.value)} style={selectSt}>
                          <option value="">— Seleccionar —</option>
                          {subs.map((s) => (
                            <option key={s.id} value={s.id}>{labelSub(s)}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <button type="button" onClick={() => setSelReas(new Set(regsReas.filter((r) => !r.sellado).map((r) => r.id)))} style={btnGhost}>Marcar no sellados</button>
                <button type="button" onClick={() => setSelReas(new Set())} style={btnGhost}>Desmarcar todos</button>
                <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }} title="Clic en fila inicial, luego Shift+clic en fila final">
                  Shift+clic = rango
                </span>
              </div>
              <SelladosConfirm
                confirmarSellados={confSellReas}
                setConfirmarSellados={setConfSellReas}
                regsPreview={regsReas}
                setSeleccion={setSelReas}
                totSellados={totSellReas}
              />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 'var(--cc-label)', fontWeight: 800, color: t.textMuted }}>Motivo (opcional, auditoría)</span>
                <input value={motivoReas} onChange={(e) => setMotivoReas(e.target.value)} placeholder="Ej. Reasignación masiva por cambio de contratista" style={{ ...selectSt, boxSizing: 'border-box' }} />
              </label>
              {renderPreviewGrid(
                regsReas,
                selReas,
                confSellReas,
                toggleReas,
                {
                  emptyMsg: 'Ningún registro cumple el filtro.',
                  chkTitle: 'Marque filas (Shift+clic = rango)',
                  extraCols: [{ key: 'sub', label: 'Sub. actual', width: 90 }],
                  extraCells: (r) => [{
                    node: r.subcontratista_id != null ? `#${r.subcontratista_id}` : '—',
                    muted: true,
                  }],
                  onRowClick: (r, e) => {
                    if (e?.shiftKey) toggleReas(r.id, r.sellado, e)
                  },
                },
              )}
              {truncadoReas && (
                <div style={{ fontSize: 'var(--cc-caption)', color: '#b45309', fontWeight: 700 }}>
                  Vista limitada a {topeReas} registros. Refine los filtros.
                </div>
              )}
            </div>
          )}

          {tab === 'reasignar' && pasoReas === 'resultado' && resultadoReas && (
            <ResultadoPanel
              t={t}
              sheet={sheet}
              titulo="Reasignación completada"
              resumen={
                <>
                  {resultadoReas.totales?.movidos ?? 0} registro(s) →{' '}
                  <strong>{labelSub(resultadoReas.subcontratista_destino)}</strong>
                  {' · '}{labelCorte(resultadoReas.corte_destino)}
                  {(resultadoReas.totales?.no_movidos || 0) > 0 && <> · {resultadoReas.totales.no_movidos} sin mover</>}
                </>
              }
              movidos={resultadoReas.movidos}
              noMovidos={resultadoReas.no_movidos}
              colsExtra={[
                {
                  key: 'de',
                  label: 'Sub. origen',
                  render: (r) => (r.subcontratista_origen_id != null ? `#${r.subcontratista_origen_id}` : '—'),
                },
                {
                  key: 'a',
                  label: 'Sub. destino',
                  render: () => labelSub(resultadoReas.subcontratista_destino),
                },
              ]}
            />
          )}
        </div>

        <div style={{
          padding: '12px 18px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          {tab === 'actas' && footerActas()}
          {tab === 'cortes' && footerCortes()}
          {tab === 'reasignar' && footerReas()}
        </div>
      </div>

      <SicoeFiltroModal
        open={filtroOpen}
        onClose={() => setFiltroOpen(false)}
        t={t}
        contratoId={contratoId}
        token={token}
        bundleAplicado={bundleFiltro}
        onBuscar={(snap) => { void buscarReasignar(snap) }}
        onLimpiarAplicado={() => {
          setBundleFiltro(null)
          setRegsReas([])
          setSelReas(new Set())
          setPasoReas('filtros')
        }}
        buscando={cargandoBuscar}
        puedeVerSubcontratista={puedeVerSubcontratista}
        estadosReporte={estadosReporte}
        etiquetasValidacion={etiquetasValidacion}
        nivelesDisponibles={nivelesDisponibles}
        encabezadoPorNivel={encabezadoPorNivel}
        estiloChipCapa={estiloChipCapa}
        avisoCapasY={avisoCapasY}
        filtroSubcList={filtroSubcList.length ? filtroSubcList : subs}
        pkList={pkList}
      />
    </div>
  )
}
