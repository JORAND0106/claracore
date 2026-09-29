import { useState, useMemo, useRef, useEffect } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { formatCOP } from '../../utils/formatCOP'
import { preIntervLiberadoParaInterventoria } from './pptoRolesValidacion'
import PptoEdicionMasivaTramosPanel from './PptoEdicionMasivaTramosPanel'
import {
  pptoFilasFuenteTramos,
  pptoFilasDetalleTramo,
  pptoActualizarCompetenciaFilas,
  pptoClonarFilasFuenteTramos,
} from './pptoTramoBusqueda'
import { pptoLabelSubcontratista } from './pptoSubcontratistaMasiva'
import {
  pptoSheetStyles,
  pptoSheetCssVars,
  pptoSheetTipStyle,
  PPTO_Z_EDICION_MASIVA,
} from './pptoSheetStyles'
import {
  PPTO_MASIVA_TIP_SELECCION,
  PPTO_MASIVA_TIP_COMPETENCIA,
  PPTO_MASIVA_TIP_OBS,
  PPTO_MASIVA_TIP_DIMS,
  PPTO_MASIVA_TIP_DEP,
  PPTO_MASIVA_TIP_INTERV,
} from './pptoEdicionMasivaTips'

const PPTO_TIPO_DEFAULT = 'Presupuesto de Obra'
const PPTO_TIPO_OBRA = 'Obra Ejecutada'

const SEMAFORO = [
  { valor: 'No Revisado', color: '#3B82F6', label: '🔵 No Revisado' },
  { valor: 'Rechazado', color: '#EF4444', label: '🔴 Rechazado' },
  { valor: 'Pendiente', color: '#D97706', label: '🟡 Pendiente' },
  { valor: 'Aprobado', color: '#16A34A', label: '🟢 Aprobado' },
]

/** Tipografía alineada con Pequeña / Mediana / Grande (`--cc-*` en documentElement). */
const cc = {
  caption: 'var(--cc-caption)',
  label: 'var(--cc-label)',
  sm: 'var(--cc-sm)',
  body: 'var(--cc-body)',
  md: 'var(--cc-md)',
  lg: 'var(--cc-lg)',
  pad: 'var(--cc-space-3)',
  padSm: 'var(--cc-space-2)',
}

function TipMark({ tip, sheet }) {
  if (!tip) return null
  return (
    <span title={tip} aria-label={tip} style={pptoSheetTipStyle(sheet)}>
      ?
    </span>
  )
}

function GrupoSheet({ titulo, tip, sheet, children, extra }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={sheet.sectionBar}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {titulo}
          <TipMark tip={tip} sheet={sheet} />
        </span>
        {extra || null}
      </div>
      <div style={sheet.sheetWrapFlush}>{children}</div>
    </div>
  )
}

function sheetInp(sheet, t, active) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    border: 'none',
    outline: 'none',
    background: active ? `${t.primary}12` : 'transparent',
    color: sheet.text,
    fontSize: 'var(--cc-input)',
    padding: '6px 4px',
    minHeight: 32,
    fontFamily: 'inherit',
  }
}

function ResumenCambios({ filas, t, sheet, titulo }) {
  if (!filas?.length) {
    return (
      <GrupoSheet titulo={titulo} sheet={sheet}>
        <div style={{ ...sheet.tdMuted, padding: 12 }}>
          Configure los valores arriba para ver el resumen.
        </div>
      </GrupoSheet>
    )
  }
  return (
    <GrupoSheet titulo={`${titulo} · ${filas.length} reg.`} sheet={sheet}>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        <table style={{ ...sheet.sheetTable, minWidth: 0, width: '100%' }}>
          <thead>
            <tr>
              {['Ref.', 'Capítulo', 'Ítem', 'Campo', 'Anterior', 'Nuevo'].map((h) => (
                <th key={h} style={sheet.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td style={{ ...sheet.tdMuted, fontFamily: 'monospace', fontSize: cc.caption }}>{f.ref}</td>
                <td style={{ ...sheet.td, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.capitulo || ''}>{f.capitulo || '—'}</td>
                <td style={{ ...sheet.td, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.item || ''}>{f.item || '—'}</td>
                <td style={sheet.tdMuted}>{f.campo}</td>
                <td style={{ ...sheet.tdMuted, maxWidth: 140, wordBreak: 'break-word' }}>{f.antiguo}</td>
                <td style={{ ...sheet.td, color: t.primary, fontWeight: 600, maxWidth: 140, wordBreak: 'break-word' }}>{f.nuevo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GrupoSheet>
  )
}

function RadioOpcion({ valor, label, color, seleccionado, onSelect, disabled, name = 'opc-masivo' }) {
  const activo = seleccionado === valor
  const c = color || '#3B82F6'
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 4,
        border: `1.5px solid ${activo ? c : 'transparent'}`,
        background: activo ? c + '18' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input type="radio" name={name} checked={activo} disabled={disabled} onChange={() => onSelect(valor)} style={{ accentColor: c }} />
      <span style={{ fontSize: cc.label, fontWeight: activo ? 700 : 500, color: c }}>{label}</span>
    </label>
  )
}

function RadioEstado({ valor, seleccionado, onSelect, disabled, name }) {
  const meta = SEMAFORO.find((s) => s.valor === valor) || { color: '#94A3B8', label: valor }
  return (
    <RadioOpcion
      valor={valor}
      label={meta.label}
      color={meta.color}
      seleccionado={seleccionado}
      onSelect={onSelect}
      disabled={disabled}
      name={name}
    />
  )
}

function ObservacionCell({ value, onChange, sheet, t }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Opcional…"
      rows={2}
      style={{
        ...sheetInp(sheet, t, !!value),
        resize: 'vertical',
        textAlign: 'left',
        lineHeight: 1.35,
      }}
    />
  )
}

/**
 * Edición masiva presupuesto: capítulo/ítem, dimensiones, tipo, tramos, depuración e interventoría.
 */
export default function PptoEdicionMasivaModal({
  open,
  onClose,
  t,
  seleccionados,
  registros,
  /** Filas actualmente visibles/filtradas en la grilla (fallback tab Tramos). */
  registrosGrilla,
  esSellado,
  /** Misma carga que el botón Tramos: fObra + capítulo → listado presupuesto. */
  onCargarFuenteTramos,
  puedeTabEditar = false,
  puedeTabDepuracion = false,
  puedeTabInterventoria = false,
  puedeEditarDimensiones = false,
  requiereDepuracionAprobadaInterv = true,
  capitulosListado,
  listadoPrecios,
  competenciasOpciones = [],
  subcontratistasOpciones = [],
  guardandoBulk,
  onApplyCapItem,
  onApplyDimensiones,
  onApplyTipo,
  onApplyTramosCompetencia,
  onApplyDepuracion,
  onApplyInterventoria,
}) {
  const ids = useMemo(() => [...seleccionados], [seleccionados])
  const filasSel = useMemo(
    () => ids.map((id) => registros.find((r) => String(r.id) === String(id))).filter(Boolean),
    [ids, registros],
  )
  const editables = useMemo(() => filasSel.filter((r) => !esSellado(r)), [filasSel, esSellado])
  const nEditables = editables.length
  const nSellados = filasSel.length - editables.length

  /** Fallback local (grilla) si la carga tipo botón Tramos no está disponible. */
  const filasFuenteFallback = useMemo(
    () => pptoFilasFuenteTramos({
      registrosGrilla: Array.isArray(registrosGrilla) ? registrosGrilla : null,
      registros,
      seleccionados,
      esSellado: () => false, // el panel deshabilita sellados; listamos como el Revisor
    }),
    [registrosGrilla, registros, seleccionados],
  )

  const editablesInterv = useMemo(
    () => (requiereDepuracionAprobadaInterv
      ? editables.filter((r) => preIntervLiberadoParaInterventoria(r))
      : editables),
    [editables, requiereDepuracionAprobadaInterv],
  )

  const tabs = useMemo(() => {
    const out = []
    if (puedeTabEditar) {
      out.push({ id: 'capitem', label: 'Capítulo / Ítem', icon: '📁' })
      if (puedeEditarDimensiones) out.push({ id: 'dims', label: 'Dimensiones', icon: '📐' })
      out.push({ id: 'tipo', label: 'Tipo de ejecución', icon: '↔' })
      out.push({ id: 'tramos', label: 'Tramos', icon: '🧭' })
    }
    if (puedeTabDepuracion) out.push({ id: 'depuracion', label: 'Validación por depuración', icon: '🔎' })
    if (puedeTabInterventoria) out.push({ id: 'interv', label: 'Validación por Interventoría', icon: '✓' })
    return out
  }, [puedeTabEditar, puedeEditarDimensiones, puedeTabDepuracion, puedeTabInterventoria])

  const [tabActivo, setTabActivo] = useState(tabs[0]?.id || 'capitem')
  const [editCapitulo, setEditCapitulo] = useState('')
  const [editItem, setEditItem] = useState('')
  const [itemBusqueda, setItemBusqueda] = useState('')
  const [itemDropOpen, setItemDropOpen] = useState(false)
  const [editCompetencia, setEditCompetencia] = useState('')
  const [editSubcontratistaId, setEditSubcontratistaId] = useState('')
  const [obsCapItem, setObsCapItem] = useState('')
  const [dimAncho, setDimAncho] = useState('')
  const [dimEspesor, setDimEspesor] = useState('')
  const [obsDims, setObsDims] = useState('')
  const [tipoEjecucion, setTipoEjecucion] = useState('')
  const [obsTipo, setObsTipo] = useState('')
  const [estadoDep, setEstadoDep] = useState('')
  const [obsDep, setObsDep] = useState('')
  const [estadoInterv, setEstadoInterv] = useState('')
  const [obsInterv, setObsInterv] = useState('')
  const [tramoSelec, setTramoSelec] = useState(null)
  const [tramosSelIds, setTramosSelIds] = useState(() => new Set())
  const [editCompetenciaTramos, setEditCompetenciaTramos] = useState('')
  const [filasFuenteTramos, setFilasFuenteTramos] = useState([])
  const [tramosCargando, setTramosCargando] = useState(false)
  const [tramosMeta, setTramosMeta] = useState({ cap: null, fuente: null, aviso: '', error: '' })
  const [resumenPost, setResumenPost] = useState(null)
  const [errorApply, setErrorApply] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const itemDropRef = useRef(null)
  const cargaTramosIdRef = useRef(0)
  /** Snapshot de tramos cargado una vez por apertura del modal; no se recarga al volver al tab. */
  const tramosSnapshotListoRef = useRef(false)

  useEffect(() => {
    if (!open) {
      tramosSnapshotListoRef.current = false
      return
    }
    setResumenPost(null)
    setErrorApply('')
    setMensajeExito('')
    setAplicando(false)
    // Limpiar TODO el formulario CapItem/Dims/etc. al abrir: si quedan capítulo/ítem
    // de una sesión anterior, un cambio solo de competencia disparaba ejecutarRecalcular + motivo.
    setEditCapitulo('')
    setEditItem('')
    setItemBusqueda('')
    setItemDropOpen(false)
    setEditCompetencia('')
    setEditSubcontratistaId('')
    setObsCapItem('')
    setDimAncho('')
    setDimEspesor('')
    setObsDims('')
    setTipoEjecucion('')
    setObsTipo('')
    setEstadoDep('')
    setObsDep('')
    setEstadoInterv('')
    setObsInterv('')
    setTramoSelec(null)
    setTramosSelIds(new Set())
    setEditCompetenciaTramos('')
    setFilasFuenteTramos([])
    setTramosCargando(false)
    setTramosMeta({ cap: null, fuente: null, aviso: '', error: '' })
    tramosSnapshotListoRef.current = false
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!tabs.some((tb) => tb.id === tabActivo)) setTabActivo(tabs[0]?.id || 'capitem')
  }, [open, tabs, tabActivo])

  // Al salir del tab Tramos, volver a la vista de lista (conserva filasFuenteTramos).
  useEffect(() => {
    if (tabActivo !== 'tramos') {
      setTramoSelec(null)
      setTramosSelIds(new Set())
    }
  }, [tabActivo])

  // Carga una sola vez por apertura del modal — no refetch al reentrar al tab
  // (así un cambio de competencia no oculta filas al volver o al reaplicar filtros fObra).
  useEffect(() => {
    if (!open || tabActivo !== 'tramos') return undefined
    if (tramosSnapshotListoRef.current) return undefined
    let cancelled = false
    const cargaId = ++cargaTramosIdRef.current
    setTramosCargando(true)
    setTramosMeta({ cap: null, fuente: null, aviso: '', error: '' })
    ;(async () => {
      try {
        let result = null
        if (typeof onCargarFuenteTramos === 'function') {
          result = await onCargarFuenteTramos()
        }
        if (cancelled || cargaId !== cargaTramosIdRef.current) return
        const raw = Array.isArray(result?.rows) && (result.rows.length > 0 || result.fuente === 'api')
          ? result.rows
          : filasFuenteFallback
        // Clonar: snapshot independiente de la grilla / respuesta API.
        setFilasFuenteTramos(pptoClonarFilasFuenteTramos(raw))
        tramosSnapshotListoRef.current = true
        setTramosMeta({
          cap: result?.cap || null,
          fuente: result?.fuente || 'grilla',
          aviso: result?.aviso || '',
          error: result?.error || '',
        })
      } catch (e) {
        if (cancelled || cargaId !== cargaTramosIdRef.current) return
        setFilasFuenteTramos(pptoClonarFilasFuenteTramos(filasFuenteFallback))
        tramosSnapshotListoRef.current = true
        setTramosMeta({
          cap: null,
          fuente: 'grilla',
          aviso: '',
          error: e?.message || 'No se pudieron cargar los tramos.',
        })
      } finally {
        if (!cancelled && cargaId === cargaTramosIdRef.current) setTramosCargando(false)
      }
    })()
    return () => { cancelled = true }
    // Solo al abrir el tab la primera vez en esta sesión del modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tabActivo])

  const filasTramoSeleccionado = useMemo(
    () => pptoFilasDetalleTramo(filasFuenteTramos, tramoSelec).map((x) => x.registro),
    [filasFuenteTramos, tramoSelec],
  )

  const itemsListado = useMemo(
    () => listadoPrecios.filter((p) => !editCapitulo || p.capitulo === editCapitulo),
    [listadoPrecios, editCapitulo],
  )
  const precioSeleccionado = useMemo(
    () => listadoPrecios.find((p) => p.item_numero === editItem) || null,
    [listadoPrecios, editItem],
  )

  const fmtDim = (v) => (v != null && v !== '' ? String(v) : '—')

  const previewCapItem = useMemo(() => {
    const tieneCap = !!editCapitulo
    const tieneItem = !!editItem
    const tieneComp = !!editCompetencia
    const tieneSub = !!String(editSubcontratistaId || '').trim()
    const tieneObs = !!obsCapItem.trim()
    if (!tieneCap && !tieneItem && !tieneComp && !tieneSub && !tieneObs) return []
    const labelNuevoSub = tieneSub
      ? pptoLabelSubcontratista(editSubcontratistaId, subcontratistasOpciones)
      : ''
    // Competencia aplica también a sellados; el resto solo a editables.
    const base = tieneComp ? filasSel : editables
    return base.map((r) => {
      const sellado = esSellado(r)
      const antCap = r.capitulo || '—'
      const antItem = r.item || '—'
      const partes = []
      if (!sellado && tieneCap && editCapitulo !== (r.capitulo || '')) partes.push(`Cap: ${antCap} → ${editCapitulo}`)
      if (!sellado && tieneItem && editItem !== (r.item || '')) partes.push(`Ítem: ${antItem} → ${editItem}`)
      if (!sellado && precioSeleccionado && tieneItem) partes.push(`V.U: ${formatCOP(precioSeleccionado.precio_unitario)}`)
      if (tieneComp && editCompetencia !== (r.competencia || '')) {
        partes.push(`Comp: ${r.competencia || '—'} → ${editCompetencia}`)
      }
      if (!sellado && tieneSub && Number(r.subcontratista_id || 0) !== Number(editSubcontratistaId)) {
        partes.push(
          `Sub: ${pptoLabelSubcontratista(r.subcontratista_id, subcontratistasOpciones)} → ${labelNuevoSub}`,
        )
      }
      if (!sellado && tieneObs) partes.push(`Obs: ${obsCapItem.trim()}`)
      if (!partes.length) return null
      return {
        id: r.id,
        ref: r.pk_id || r.id,
        capitulo: r.capitulo,
        item: r.item,
        campo: 'Capítulo / Ítem',
        antiguo: `${antCap} / ${antItem}`,
        nuevo: partes.join(' · '),
      }
    }).filter(Boolean)
  }, [
    editCapitulo, editItem, editCompetencia, editSubcontratistaId, obsCapItem,
    editables, filasSel, precioSeleccionado, subcontratistasOpciones, esSellado,
  ])

  const previewTramos = useMemo(() => {
    const comp = String(editCompetenciaTramos || '').trim()
    if (!comp || tramosSelIds.size === 0) return []
    return filasTramoSeleccionado
      .filter((r) => tramosSelIds.has(r.id) && (r.competencia || '') !== comp)
      .map((r) => ({
        id: r.id,
        ref: r.pk_id || r.id,
        capitulo: r.capitulo,
        item: r.item,
        campo: 'Competencia',
        antiguo: r.competencia || '—',
        nuevo: comp,
      }))
  }, [editCompetenciaTramos, tramosSelIds, filasTramoSeleccionado])

  const previewDims = useMemo(() => {
    const hasAn = dimAncho.trim() !== ''
    const hasE = dimEspesor.trim() !== ''
    const hasObs = obsDims.trim() !== ''
    if (!hasAn && !hasE && !hasObs) return []
    const parseDim = (s) => {
      const n = parseFloat(String(s).replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }
    const anNum = hasAn ? parseDim(dimAncho.trim()) : null
    const espNum = hasE ? parseDim(dimEspesor.trim()) : null
    return editables.map((r) => {
      const partes = []
      if (hasAn && anNum != null) partes.push(`Ancho: ${fmtDim(r.ancho)} → ${anNum}`)
      if (hasE && espNum != null) partes.push(`Espesor: ${fmtDim(r.espesor)} → ${espNum}`)
      if (anNum != null || espNum != null) {
        const area = parseFloat(r.area_long_nod) || 0
        const w = anNum ?? (parseFloat(r.ancho) || 0)
        const e = espNum ?? (parseFloat(r.espesor) || 0)
        const cant = (w > 0 || e > 0) ? Math.round(area * w * e * 100) / 100 : Math.round(area * 100) / 100
        const costo = Math.round(cant * (parseFloat(r.vlr_unitario) || 0))
        partes.push(`Cant → ${cant}`)
        partes.push(`CD → ${formatCOP(costo)}`)
      }
      if (hasObs) partes.push(`Obs: ${obsDims.trim()}`)
      return {
        id: r.id,
        ref: r.pk_id || r.id,
        capitulo: r.capitulo,
        item: r.item,
        campo: 'Dimensiones',
        antiguo: `a/l/n ${fmtDim(r.area_long_nod)} · ${fmtDim(r.ancho)} × ${fmtDim(r.espesor)}`,
        nuevo: partes.join(' · '),
      }
    })
  }, [dimAncho, dimEspesor, obsDims, editables])

  const previewTipo = useMemo(() => {
    if (!tipoEjecucion) return []
    return editables
      .filter((r) => (r.tipo_ejecucion || PPTO_TIPO_DEFAULT) !== tipoEjecucion || obsTipo.trim())
      .map((r) => ({
        id: r.id,
        ref: r.pk_id || r.id,
        capitulo: r.capitulo,
        item: r.item,
        campo: 'Tipo ejecución',
        antiguo: r.tipo_ejecucion || PPTO_TIPO_DEFAULT,
        nuevo: tipoEjecucion + (obsTipo.trim() ? ` · Obs: ${obsTipo.trim()}` : ''),
      }))
  }, [tipoEjecucion, obsTipo, editables])

  const previewDep = useMemo(() => {
    if (!estadoDep) return []
    return editables
      .filter((r) => (r.pre_interv_estado || 'No Revisado') !== estadoDep || obsDep.trim())
      .map((r) => ({
        id: r.id,
        ref: r.pk_id || r.id,
        capitulo: r.capitulo,
        item: r.item,
        campo: 'Depuración',
        antiguo: r.pre_interv_estado || 'No Revisado',
        nuevo: estadoDep + (obsDep.trim() ? ` · Obs: ${obsDep.trim()}` : ''),
      }))
  }, [estadoDep, obsDep, editables])

  const previewInterv = useMemo(() => {
    if (!estadoInterv) return []
    return editablesInterv
      .filter((r) => (r.revisado || 'No Revisado') !== estadoInterv || obsInterv.trim())
      .map((r) => ({
        id: r.id,
        ref: r.pk_id || r.id,
        capitulo: r.capitulo,
        item: r.item,
        campo: 'Interventoría',
        antiguo: r.revisado || 'No Revisado',
        nuevo: estadoInterv + (obsInterv.trim() ? ` · Obs: ${obsInterv.trim()}` : ''),
      }))
  }, [estadoInterv, obsInterv, editablesInterv])

  if (!open) return null
  if (!tabs.length) return null

  const tabSafe = tabs.some((tb) => tb.id === tabActivo) ? tabActivo : tabs[0]?.id

  const handleApply = async () => {
    setErrorApply('')
    setMensajeExito('')
    setResumenPost(null)
    setAplicando(true)
    try {
      let resumen = []
      if (tabSafe === 'capitem') {
        if (!editCapitulo && !editItem && !editCompetencia && !editSubcontratistaId && !obsCapItem.trim()) {
          setErrorApply('Seleccione capítulo, ítem, competencia, subcontratista u observación (opcional).')
          return
        }
        resumen = await onApplyCapItem({
          capitulo: editCapitulo,
          item: editItem,
          competencia: editCompetencia,
          precioSeleccionado,
          observacion: obsCapItem,
          subcontratistaId: editSubcontratistaId || null,
        })
      } else if (tabSafe === 'dims') {
        if (!dimAncho.trim() && !dimEspesor.trim() && !obsDims.trim()) {
          setErrorApply('Indique al menos una dimensión u observación (opcional).')
          return
        }
        resumen = await onApplyDimensiones({
          ancho: dimAncho,
          espesor: dimEspesor,
          observacion: obsDims,
        })
      } else if (tabSafe === 'tipo') {
        if (!tipoEjecucion) {
          setErrorApply('Seleccione un tipo de ejecución.')
          return
        }
        resumen = await onApplyTipo({ tipo_ejecucion: tipoEjecucion, observacion: obsTipo })
      } else if (tabSafe === 'tramos') {
        if (!String(editCompetenciaTramos || '').trim()) {
          setErrorApply('Seleccione la nueva competencia.')
          return
        }
        if (tramosSelIds.size === 0) {
          setErrorApply('Seleccione al menos un registro del tramo.')
          return
        }
        if (typeof onApplyTramosCompetencia !== 'function') {
          setErrorApply('La acción de Tramos no está disponible.')
          return
        }
        const compTramos = String(editCompetenciaTramos || '').trim()
        // Ids seleccionados al confirmar — el listado no se filtra ni recarga tras el cambio.
        const idsSelTramos = [...tramosSelIds]
        resumen = await onApplyTramosCompetencia({
          ids: idsSelTramos,
          competencia: compTramos,
        })
        // Solo actualiza "Competencia actual" in-place; conserva todas las filas del snapshot.
        if (idsSelTramos.length && compTramos) {
          setFilasFuenteTramos((prev) => {
            const next = pptoActualizarCompetenciaFilas(prev, idsSelTramos, compTramos)
            // Invariante: nunca achicar el listado al cambiar competencia.
            return next.length === (prev?.length || 0) ? next : prev
          })
          // Desmarcar aplicados para no reaplicar el mismo cambio; las filas siguen visibles.
          const remove = new Set(idsSelTramos.map((id) => String(id)))
          setTramosSelIds((prev) => {
            const next = new Set()
            for (const id of prev) {
              if (!remove.has(String(id))) next.add(id)
            }
            return next
          })
        }
      } else if (tabSafe === 'depuracion') {
        if (!estadoDep) {
          setErrorApply('Seleccione un estado de depuración.')
          return
        }
        resumen = await onApplyDepuracion({ estado: estadoDep, observacion: obsDep })
      } else if (tabSafe === 'interv') {
        if (!estadoInterv) {
          setErrorApply('Seleccione un estado de interventoría.')
          return
        }
        resumen = await onApplyInterventoria({ estado: estadoInterv, observacion: obsInterv })
      }
      const n = resumen?.length ?? 0
      if (resumen?.length) setResumenPost(resumen)
      setMensajeExito(
        n > 0
          ? `La edición masiva se aplicó correctamente en ${n} registro${n !== 1 ? 's' : ''}.`
          : 'La edición masiva se ejecutó correctamente.',
      )
      // Tab Tramos: permanece abierto para seguir editando con la columna ya actualizada.
      if (tabSafe !== 'tramos') {
        window.setTimeout(() => onClose(), 900)
      }
    } catch (e) {
      setErrorApply(e?.message || 'No se pudo aplicar la edición masiva.')
    } finally {
      setAplicando(false)
    }
  }

  const busy = guardandoBulk || aplicando

  const previewActual =
    tabSafe === 'capitem' ? previewCapItem
      : tabSafe === 'dims' ? previewDims
        : tabSafe === 'tipo' ? previewTipo
          : tabSafe === 'tramos' ? previewTramos
            : tabSafe === 'depuracion' ? previewDep
              : previewInterv

  const resumenMostrar = resumenPost?.length ? resumenPost : previewActual

  const nEditablesInterv = editablesInterv.length
  const nBloqueadosInterv = editables.length - nEditablesInterv


  const sheet = pptoSheetStyles(t)
  const sheetCss = pptoSheetCssVars(t)
  const tipSel = `${PPTO_MASIVA_TIP_SELECCION} (${nEditables} editable${nEditables !== 1 ? 's' : ''}).`
  const tipSelInterv = `${PPTO_MASIVA_TIP_SELECCION} (${nEditablesInterv} editable${nEditablesInterv !== 1 ? 's' : ''} para Interventoría).`

  const th = (label, tip) => (
    <th style={sheet.th}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <TipMark tip={tip} sheet={sheet} />
      </span>
    </th>
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="cc-ppto-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: t.overlay || 'rgba(0,0,0,0.55)',
        zIndex: PPTO_Z_EDICION_MASIVA,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: cc.pad,
        fontSize: cc.body,
        lineHeight: 1.45,
        fontFamily: 'inherit',
        ...sheetCss,
      }}
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        className="cc-ppto-modal-sheet cc-ppto-edicion-excel"
        style={{
          background: t.bgCard,
          border: `1px solid ${sheet.border}`,
          borderRadius: 8,
          width: 'min(1104px, 96vw)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          fontSize: 'inherit',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={t} />
        <div
          style={{
            padding: `${cc.pad} 16px ${cc.padSm}`,
            borderBottom: `1px solid ${sheet.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: cc.md, fontWeight: 800, color: t.primary }}>Edición masiva</div>
            <div style={{ fontSize: cc.sm, color: t.textMuted, marginTop: 4 }}>
              {nEditables} editable{nEditables !== 1 ? 's' : ''} de {filasSel.length} seleccionado{filasSel.length !== 1 ? 's' : ''}
              {nSellados > 0 ? ` · ${nSellados} sellado(s) se omiten` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ background: 'transparent', border: 'none', fontSize: cc.lg, cursor: 'pointer', color: t.textMuted, lineHeight: 1 }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', gap: 2, padding: '8px 10px 0', borderBottom: `1px solid ${sheet.border}`, overflowX: 'auto', background: sheet.headerBg }}>
          {tabs.map((tab) => {
            const activo = tabSafe === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setTabActivo(tab.id); setResumenPost(null); setErrorApply('') }}
                style={{
                  flex: '0 0 auto',
                  padding: '8px 12px',
                  border: `1px solid ${activo ? sheet.border : 'transparent'}`,
                  borderBottom: activo ? `2px solid ${t.primary}` : '2px solid transparent',
                  background: activo ? t.bgCard : 'transparent',
                  color: activo ? t.primary : t.textMuted,
                  fontWeight: activo ? 800 : 600,
                  fontSize: cc.caption,
                  cursor: 'pointer',
                  borderRadius: '4px 4px 0 0',
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >
                {tab.icon} {tab.label}
              </button>
            )
          })}
        </div>

        <div className="cc-ppto-modal-body cc-ppto-edicion-body" style={{ padding: 14, overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
          {tabSafe === 'capitem' && (
            <GrupoSheet titulo="Capítulo / Ítem" tip={tipSel} sheet={sheet}>
              <table style={{ ...sheet.sheetTable, minWidth: 0, width: '100%' }}>
                <thead>
                  <tr>
                    {th('Capítulo', tipSel)}
                    {th('Ítem', null)}
                    {th('V. unit.', null)}
                    {th('Competencia', PPTO_MASIVA_TIP_COMPETENCIA)}
                    {th('Subcontratista', null)}
                    {th('Obs.', PPTO_MASIVA_TIP_OBS)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={sheet.td}>
                      <select
                        value={editCapitulo}
                        onChange={(e) => { setEditCapitulo(e.target.value); setEditItem(''); setItemBusqueda('') }}
                        style={sheetInp(sheet, t, !!editCapitulo)}
                      >
                        <option value="">— Sin cambio —</option>
                        {capitulosListado.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ ...sheet.td, position: 'relative' }}>
                      <input
                        value={itemBusqueda}
                        onChange={(e) => { setItemBusqueda(e.target.value); setItemDropOpen(true); if (!e.target.value) setEditItem('') }}
                        onFocus={() => setItemDropOpen(true)}
                        onBlur={() => setTimeout(() => setItemDropOpen(false), 180)}
                        placeholder={editCapitulo ? 'Buscar ítem…' : 'Elija capítulo'}
                        disabled={!editCapitulo}
                        style={{ ...sheetInp(sheet, t, !!editItem), opacity: editCapitulo ? 1 : 0.5 }}
                      />
                      {itemDropOpen && editCapitulo && itemBusqueda.length > 0 && (
                        <div ref={itemDropRef} style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: t.bgCard, border: `1px solid ${sheet.border}`, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', fontSize: cc.sm }}>
                          {itemsListado
                            .filter((p) => `${p.item_numero} ${p.descripcion}`.toLowerCase().includes(itemBusqueda.toLowerCase()))
                            .slice(0, 40)
                            .map((p) => (
                              <div
                                key={p.id}
                                onMouseDown={() => {
                                  setEditItem(p.item_numero)
                                  setItemBusqueda(`${p.item_numero} · ${p.descripcion}`)
                                  setItemDropOpen(false)
                                }}
                                style={{ padding: `${cc.padSm} 12px`, cursor: 'pointer', borderBottom: `1px solid ${sheet.border}` }}
                              >
                                <strong>{p.item_numero}</strong> · {p.descripcion}
                              </div>
                            ))}
                        </div>
                      )}
                    </td>
                    <td style={{ ...sheet.td, fontWeight: 700, color: t.primary, whiteSpace: 'nowrap' }}>
                      {precioSeleccionado ? formatCOP(precioSeleccionado.precio_unitario) : '—'}
                    </td>
                    <td style={sheet.td}>
                      <select
                        value={editCompetencia}
                        onChange={(e) => setEditCompetencia(e.target.value)}
                        style={sheetInp(sheet, t, !!editCompetencia)}
                      >
                        <option value="">— Sin cambio —</option>
                        {(competenciasOpciones || []).map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td style={sheet.td}>
                      <select
                        value={editSubcontratistaId}
                        onChange={(e) => setEditSubcontratistaId(e.target.value)}
                        disabled={!nEditables}
                        style={{ ...sheetInp(sheet, t, !!editSubcontratistaId), opacity: nEditables ? 1 : 0.55 }}
                      >
                        <option value="">— Sin cambio —</option>
                        {(subcontratistasOpciones || []).map((s) => (
                          <option key={s.id} value={String(s.id)}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={sheet.td}>
                      <ObservacionCell value={obsCapItem} onChange={setObsCapItem} sheet={sheet} t={t} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </GrupoSheet>
          )}

          {tabSafe === 'tramos' && (
            <PptoEdicionMasivaTramosPanel
              t={t}
              sheet={sheet}
              filasFuente={filasFuenteTramos}
              cargando={tramosCargando}
              meta={tramosMeta}
              esSellado={esSellado}
              tramoSelec={tramoSelec}
              onSelectTramo={setTramoSelec}
              tramosSelIds={tramosSelIds}
              setTramosSelIds={setTramosSelIds}
              editCompetenciaTramos={editCompetenciaTramos}
              setEditCompetenciaTramos={setEditCompetenciaTramos}
              competenciasOpciones={competenciasOpciones}
              busy={busy}
              onAplicar={handleApply}
            />
          )}

          {tabSafe === 'dims' && (
            <GrupoSheet titulo="Dimensiones" tip={`${tipSel} ${PPTO_MASIVA_TIP_DIMS}`} sheet={sheet}>
              <table style={{ ...sheet.sheetTable, minWidth: 0, width: '100%' }}>
                <thead>
                  <tr>
                    {th('Ancho', PPTO_MASIVA_TIP_DIMS)}
                    {th('Espesor', PPTO_MASIVA_TIP_DIMS)}
                    {th('Obs.', PPTO_MASIVA_TIP_OBS)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={sheet.td}>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={dimAncho}
                        disabled={!nEditables}
                        onChange={(e) => setDimAncho(e.target.value)}
                        placeholder="— Sin cambio —"
                        style={{ ...sheetInp(sheet, t, !!dimAncho), opacity: nEditables ? 1 : 0.5, textAlign: 'right' }}
                      />
                    </td>
                    <td style={sheet.td}>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={dimEspesor}
                        disabled={!nEditables}
                        onChange={(e) => setDimEspesor(e.target.value)}
                        placeholder="— Sin cambio —"
                        style={{ ...sheetInp(sheet, t, !!dimEspesor), opacity: nEditables ? 1 : 0.5, textAlign: 'right' }}
                      />
                    </td>
                    <td style={sheet.td}>
                      <ObservacionCell value={obsDims} onChange={setObsDims} sheet={sheet} t={t} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </GrupoSheet>
          )}

          {tabSafe === 'tipo' && (
            <GrupoSheet titulo="Tipo de ejecución" tip={tipSel} sheet={sheet}>
              <table style={{ ...sheet.sheetTable, minWidth: 0, width: '100%' }}>
                <thead>
                  <tr>
                    {th('Tipo', tipSel)}
                    {th('Obs.', PPTO_MASIVA_TIP_OBS)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={sheet.td}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        <RadioOpcion valor={PPTO_TIPO_DEFAULT} label={`📋 ${PPTO_TIPO_DEFAULT}`} color="#7C3AED" seleccionado={tipoEjecucion} onSelect={setTipoEjecucion} disabled={!nEditables} name="tipo-masivo" />
                        <RadioOpcion valor={PPTO_TIPO_OBRA} label={`🏗 ${PPTO_TIPO_OBRA}`} color="#7C3AED" seleccionado={tipoEjecucion} onSelect={setTipoEjecucion} disabled={!nEditables} name="tipo-masivo" />
                      </div>
                    </td>
                    <td style={sheet.td}>
                      <ObservacionCell value={obsTipo} onChange={setObsTipo} sheet={sheet} t={t} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </GrupoSheet>
          )}

          {tabSafe === 'depuracion' && (
            <GrupoSheet titulo="Depuración" tip={`${tipSel} ${PPTO_MASIVA_TIP_DEP}`} sheet={sheet}>
              <table style={{ ...sheet.sheetTable, minWidth: 0, width: '100%' }}>
                <thead>
                  <tr>
                    {th('Estado', PPTO_MASIVA_TIP_DEP)}
                    {th('Obs.', PPTO_MASIVA_TIP_OBS)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={sheet.td}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 4 }}>
                        {SEMAFORO.map((s) => (
                          <RadioEstado key={s.valor} name="dep-masivo" valor={s.valor} seleccionado={estadoDep} onSelect={setEstadoDep} disabled={!nEditables} />
                        ))}
                      </div>
                    </td>
                    <td style={sheet.td}>
                      <ObservacionCell value={obsDep} onChange={setObsDep} sheet={sheet} t={t} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </GrupoSheet>
          )}

          {tabSafe === 'interv' && (
            <GrupoSheet titulo="Interventoría" tip={`${tipSelInterv} ${PPTO_MASIVA_TIP_INTERV}`} sheet={sheet}>
              {requiereDepuracionAprobadaInterv && nBloqueadosInterv > 0 && (
                <div style={{ ...sheet.td, color: '#B45309', fontSize: cc.caption, borderBottom: `1px solid ${sheet.border}` }}>
                  {nBloqueadosInterv} sin depuración aprobada — Interventoría solo con depuración «Aprobado».
                </div>
              )}
              <table style={{ ...sheet.sheetTable, minWidth: 0, width: '100%' }}>
                <thead>
                  <tr>
                    {th('Estado', PPTO_MASIVA_TIP_INTERV)}
                    {th('Obs.', PPTO_MASIVA_TIP_OBS)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={sheet.td}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 4 }}>
                        {SEMAFORO.map((s) => (
                          <RadioEstado key={s.valor} name="interv-masivo" valor={s.valor} seleccionado={estadoInterv} onSelect={setEstadoInterv} disabled={!nEditablesInterv} />
                        ))}
                      </div>
                    </td>
                    <td style={sheet.td}>
                      <ObservacionCell value={obsInterv} onChange={setObsInterv} sheet={sheet} t={t} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </GrupoSheet>
          )}

          <div style={{ marginTop: 8 }}>
            <ResumenCambios
              filas={resumenMostrar}
              t={t}
              sheet={sheet}
              titulo={resumenPost?.length ? 'Cambios aplicados' : 'Vista previa'}
            />
          </div>

          {mensajeExito && (
            <div style={{ marginTop: 10, padding: `${cc.padSm} ${cc.pad}`, background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 4, color: '#166534', fontSize: cc.sm, fontWeight: 600 }}>
              {mensajeExito}
            </div>
          )}

          {errorApply && (
            <div style={{ marginTop: 10, padding: `${cc.padSm} ${cc.pad}`, background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 4, color: '#B91C1C', fontSize: cc.sm }}>
              {errorApply}
            </div>
          )}
        </div>

        <div className="cc-ppto-modal-footer" style={{ padding: `12px 16px`, borderTop: `1px solid ${sheet.border}`, display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ background: 'transparent', border: `1px solid ${sheet.border}`, borderRadius: 6, padding: `10px 20px`, color: t.textMuted, cursor: 'pointer', fontSize: cc.label }}
          >
            Cancelar
          </button>
          {!(tabSafe === 'tramos' && !tramoSelec) && (
            <button
              type="button"
              onClick={handleApply}
              disabled={
                busy
                || (tabSafe === 'interv'
                  ? nEditablesInterv === 0
                  : tabSafe === 'tramos'
                    ? (tramosSelIds.size === 0 || !String(editCompetenciaTramos || '').trim() || filasFuenteTramos.length === 0)
                    : tabSafe === 'capitem'
                      ? (
                        !(nEditables > 0 || (String(editCompetencia || '').trim() && filasSel.length > 0))
                      )
                      : nEditables === 0)
              }
              style={{
                background: t.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: `10px 24px`,
                fontWeight: 700,
                fontSize: cc.label,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy
                ? 'Aplicando…'
                : tabSafe === 'tramos'
                  ? 'Aplicar a seleccionados'
                  : 'Editar masivamente'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
