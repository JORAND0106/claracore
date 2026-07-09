import { useState, useMemo, useRef, useEffect } from 'react'
import { formatCOP } from '../../utils/formatCOP'
import { preIntervLiberadoParaInterventoria } from './pptoRolesValidacion'

const PPTO_TIPO_DEFAULT = 'Presupuesto de Obra'
const PPTO_TIPO_OBRA = 'Obra Ejecutada'

const HINT_EXCEL_OBS =
  'Opcional. El texto se verá en la exportación Excel de presupuesto, columna «Observación» del detalle por ítem.'

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

function AvisoMasivaSeleccion({ t, n }) {
  if (!n) return null
  return (
    <p
      style={{
        margin: 0,
        fontSize: cc.caption,
        color: t.textMuted,
        fontStyle: 'italic',
        opacity: 0.82,
        lineHeight: 1.45,
      }}
    >
      Los valores que defina aquí se aplicarán a los {n} registro{n !== 1 ? 's' : ''} seleccionado{n !== 1 ? 's' : ''} editables de esta pestaña.
    </p>
  )
}

function ResumenCambios({ filas, t, titulo }) {
  if (!filas?.length) {
    return (
      <div
        style={{
          padding: cc.pad,
          background: t.bg,
          borderRadius: 10,
          border: `1px dashed ${t.border}`,
          color: t.textMuted,
          fontSize: cc.sm,
        }}
      >
        Configure los valores arriba para ver el resumen de cambios.
      </div>
    )
  }
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <div
        style={{
          padding: `${cc.padSm} ${cc.pad}`,
          background: t.primary + '14',
          borderBottom: `1px solid ${t.border}`,
          fontSize: cc.sm,
          fontWeight: 700,
          color: t.primary,
        }}
      >
        {titulo} — {filas.length} registro{filas.length !== 1 ? 's' : ''}
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: cc.sm }}>
          <thead>
            <tr style={{ background: t.bg, position: 'sticky', top: 0 }}>
              {['Ref.', 'Capítulo', 'Ítem', 'Campo', 'Anterior', 'Nuevo'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: `${cc.padSm} 10px`,
                    textAlign: 'left',
                    color: t.textMuted,
                    fontWeight: 700,
                    fontSize: cc.caption,
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
            {filas.map((f) => (
              <tr key={f.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                <td style={{ padding: `${cc.padSm} 10px`, color: t.textMuted, fontFamily: 'monospace', fontSize: cc.caption }}>{f.ref}</td>
                <td style={{ padding: `${cc.padSm} 10px`, color: t.text, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.capitulo || '—'}</td>
                <td style={{ padding: `${cc.padSm} 10px`, color: t.text, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.item || '—'}</td>
                <td style={{ padding: `${cc.padSm} 10px`, color: t.textMuted, fontSize: cc.caption }}>{f.campo}</td>
                <td style={{ padding: `${cc.padSm} 10px`, color: '#94A3B8', maxWidth: 140, wordBreak: 'break-word' }}>{f.antiguo}</td>
                <td style={{ padding: `${cc.padSm} 10px`, color: t.primary, fontWeight: 600, maxWidth: 140, wordBreak: 'break-word' }}>{f.nuevo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RadioOpcion({ valor, label, color, seleccionado, onSelect, disabled, name = 'opc-masiva' }) {
  const activo = seleccionado === valor
  const c = color || '#3B82F6'
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: `${cc.padSm} ${cc.pad}`,
        borderRadius: 10,
        border: `2px solid ${activo ? c : 'transparent'}`,
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

function DimInput({ label, value, onChange, disabled, t, title }) {
  return (
    <div style={{ flex: '1 1 140px' }} title={title}>
      <div style={{ fontSize: cc.caption, fontWeight: 700, color: t.textMuted, marginBottom: 6, letterSpacing: 0.3 }}>{label}</div>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="— Sin cambio —"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: t.inputBg,
          border: `1.5px solid ${value ? t.primary : t.border}`,
          borderRadius: 8,
          padding: `${cc.padSm} 12px`,
          color: t.text,
          fontSize: cc.sm,
          opacity: disabled ? 0.5 : 1,
        }}
      />
    </div>
  )
}

/**
 * Edición masiva presupuesto: capítulo/ítem, dimensiones, tipo, depuración e interventoría.
 */
export default function PptoEdicionMasivaModal({
  open,
  onClose,
  t,
  seleccionados,
  registros,
  esSellado,
  puedeTabEditar = false,
  puedeTabDepuracion = false,
  puedeTabInterventoria = false,
  puedeEditarDimensiones = false,
  requiereDepuracionAprobadaInterv = true,
  capitulosListado,
  listadoPrecios,
  guardandoBulk,
  onApplyCapItem,
  onApplyDimensiones,
  onApplyTipo,
  onApplyDepuracion,
  onApplyInterventoria,
}) {
  const ids = useMemo(() => [...seleccionados], [seleccionados])
  const filasSel = useMemo(
    () => ids.map((id) => registros.find((r) => r.id === id)).filter(Boolean),
    [ids, registros],
  )
  const editables = useMemo(() => filasSel.filter((r) => !esSellado(r)), [filasSel, esSellado])
  const nEditables = editables.length
  const nSellados = filasSel.length - editables.length

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
  const [resumenPost, setResumenPost] = useState(null)
  const [errorApply, setErrorApply] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const itemDropRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setResumenPost(null)
    setErrorApply('')
    setMensajeExito('')
    setAplicando(false)
    if (!tabs.some((tb) => tb.id === tabActivo)) setTabActivo(tabs[0]?.id || 'capitem')
  }, [open, tabs, tabActivo])

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
    const tieneObs = !!obsCapItem.trim()
    if (!tieneCap && !tieneItem && !tieneObs) return []
    return editables.map((r) => {
      const antCap = r.capitulo || '—'
      const antItem = r.item || '—'
      const partes = []
      if (tieneCap && editCapitulo !== (r.capitulo || '')) partes.push(`Cap: ${antCap} → ${editCapitulo}`)
      if (tieneItem && editItem !== (r.item || '')) partes.push(`Ítem: ${antItem} → ${editItem}`)
      if (precioSeleccionado && tieneItem) partes.push(`V.U: ${formatCOP(precioSeleccionado.precio_unitario)}`)
      if (tieneObs) partes.push(`Obs: ${obsCapItem.trim()}`)
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
  }, [editCapitulo, editItem, obsCapItem, editables, precioSeleccionado])

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
        if (!editCapitulo && !editItem && !obsCapItem.trim()) {
          setErrorApply('Seleccione capítulo, ítem u observación (opcional).')
          return
        }
        resumen = await onApplyCapItem({
          capitulo: editCapitulo,
          item: editItem,
          precioSeleccionado,
          observacion: obsCapItem,
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
      window.setTimeout(() => onClose(), 900)
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
          : tabSafe === 'depuracion' ? previewDep
            : previewInterv

  const resumenMostrar = resumenPost?.length ? resumenPost : previewActual

  const nEditablesInterv = editablesInterv.length
  const nBloqueadosInterv = editables.length - nEditablesInterv

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="cc-ppto-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 5000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: cc.pad,
        fontSize: cc.body,
        lineHeight: 1.45,
        fontFamily: 'inherit',
      }}
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        className="cc-ppto-modal-sheet"
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 16,
          width: 'min(920px, 96vw)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          fontSize: 'inherit',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: `${cc.pad} 22px ${cc.padSm}`,
            borderBottom: `1px solid ${t.border}`,
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

        <div style={{ display: 'flex', gap: 4, padding: `10px 14px 0`, borderBottom: `1px solid ${t.border}`, overflowX: 'auto' }}>
          {tabs.map((tab) => {
            const activo = tabSafe === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setTabActivo(tab.id); setResumenPost(null); setErrorApply('') }}
                style={{
                  flex: '0 0 auto',
                  padding: `10px 16px`,
                  border: 'none',
                  borderBottom: activo ? `3px solid ${t.primary}` : '3px solid transparent',
                  background: activo ? t.primary + '12' : 'transparent',
                  color: activo ? t.primary : t.textMuted,
                  fontWeight: activo ? 700 : 500,
                  fontSize: cc.sm,
                  cursor: 'pointer',
                  borderRadius: '8px 8px 0 0',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.icon} {tab.label}
              </button>
            )
          })}
        </div>

        <div className="cc-ppto-modal-body cc-ppto-edicion-body" style={{ padding: `18px 22px`, overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
          {tabSafe === 'capitem' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <AvisoMasivaSeleccion t={t} n={nEditables} />
              <div className="cc-ppto-edicion-fields" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ fontSize: cc.caption, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>NUEVO CAPÍTULO</div>
                  <select
                    value={editCapitulo}
                    onChange={(e) => { setEditCapitulo(e.target.value); setEditItem(''); setItemBusqueda('') }}
                    style={{ width: '100%', background: t.inputBg, border: `1.5px solid ${editCapitulo ? t.primary : t.border}`, borderRadius: 8, padding: `${cc.padSm} 12px`, color: t.text, fontSize: cc.sm }}
                  >
                    <option value="">— Sin cambio —</option>
                    {capitulosListado.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: '2 1 280px', position: 'relative' }}>
                  <div style={{ fontSize: cc.caption, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>NUEVO ÍTEM</div>
                  <input
                    value={itemBusqueda}
                    onChange={(e) => { setItemBusqueda(e.target.value); setItemDropOpen(true); if (!e.target.value) setEditItem('') }}
                    onFocus={() => setItemDropOpen(true)}
                    onBlur={() => setTimeout(() => setItemDropOpen(false), 180)}
                    placeholder={editCapitulo ? 'Buscar ítem…' : 'Primero seleccione capítulo'}
                    disabled={!editCapitulo}
                    style={{ width: '100%', background: t.inputBg, border: `1.5px solid ${editItem ? t.primary : t.border}`, borderRadius: 8, padding: `${cc.padSm} 12px`, color: t.text, fontSize: cc.sm, opacity: editCapitulo ? 1 : 0.5 }}
                  />
                  {itemDropOpen && editCapitulo && itemBusqueda.length > 0 && (
                    <div ref={itemDropRef} style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8, maxHeight: 200, overflowY: 'auto', marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', fontSize: cc.sm }}>
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
                            style={{ padding: `${cc.padSm} 12px`, cursor: 'pointer', borderBottom: `1px solid ${t.border}` }}
                          >
                            <strong>{p.item_numero}</strong> · {p.descripcion}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                {precioSeleccionado && (
                  <span style={{ fontSize: cc.sm, fontWeight: 700, color: t.primary, padding: `${cc.padSm} 12px`, background: t.primary + '14', borderRadius: 8 }}>
                    {formatCOP(precioSeleccionado.precio_unitario)}
                  </span>
                )}
              </div>
              <ObservacionBox t={t} value={obsCapItem} onChange={setObsCapItem} />
            </div>
          )}

          {tabSafe === 'dims' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <AvisoMasivaSeleccion t={t} n={nEditables} />
              <p style={{ margin: 0, fontSize: cc.caption, color: t.textMuted, fontStyle: 'italic', opacity: 0.82 }}>
                <strong>Ancho</strong> y <strong>espesor</strong> se editan aquí (también en registros enlazados al plano). El <strong>área/long/nodo</strong> del plano no se cambia en masa — viene de ClaraLink/DWG.
              </p>
              <div className="cc-ppto-edicion-fields" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <DimInput label="ANCHO" value={dimAncho} onChange={setDimAncho} disabled={!nEditables} t={t} />
                <DimInput label="ESPESOR" value={dimEspesor} onChange={setDimEspesor} disabled={!nEditables} t={t} />
              </div>
              <p style={{ margin: 0, fontSize: cc.caption, color: t.textMuted }}>
                Cant. total usa el área del plano × Ancho × Espesor (si aplica) → se recalcula costo directo por registro.
              </p>
              <ObservacionBox t={t} value={obsDims} onChange={setObsDims} />
            </div>
          )}

          {tabSafe === 'tipo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <AvisoMasivaSeleccion t={t} n={nEditables} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <RadioOpcion valor={PPTO_TIPO_DEFAULT} label={`📋 ${PPTO_TIPO_DEFAULT}`} color="#7C3AED" seleccionado={tipoEjecucion} onSelect={setTipoEjecucion} disabled={!nEditables} name="tipo-masivo" />
                <RadioOpcion valor={PPTO_TIPO_OBRA} label={`🏗 ${PPTO_TIPO_OBRA}`} color="#7C3AED" seleccionado={tipoEjecucion} onSelect={setTipoEjecucion} disabled={!nEditables} name="tipo-masivo" />
              </div>
              <ObservacionBox t={t} value={obsTipo} onChange={setObsTipo} />
            </div>
          )}

          {tabSafe === 'depuracion' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <AvisoMasivaSeleccion t={t} n={nEditables} />
              <div style={{ fontSize: cc.sm, color: t.textMuted }}>
                Depuración (Residente de Costos / Obra). Pendiente o Rechazado abren el comentario de validación del sistema.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {SEMAFORO.map((s) => (
                  <RadioEstado key={s.valor} name="dep-masivo" valor={s.valor} seleccionado={estadoDep} onSelect={setEstadoDep} disabled={!nEditables} />
                ))}
              </div>
              <ObservacionBox t={t} value={obsDep} onChange={setObsDep} />
            </div>
          )}

          {tabSafe === 'interv' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <AvisoMasivaSeleccion t={t} n={nEditablesInterv} />
              {requiereDepuracionAprobadaInterv && nBloqueadosInterv > 0 && (
                <p style={{ margin: 0, fontSize: cc.caption, color: '#B45309', fontStyle: 'italic', lineHeight: 1.45 }}>
                  {nBloqueadosInterv} registro{nBloqueadosInterv !== 1 ? 's' : ''} sin depuración aprobada: Interventoría solo aplica cuando depuración contratista está en «Aprobado».
                </p>
              )}
              <div style={{ fontSize: cc.sm, color: t.textMuted }}>
                Validación Interventoría (rol Interventoría / Gerencial). Pendiente o Rechazado abren el comentario de validación del sistema.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {SEMAFORO.map((s) => (
                  <RadioEstado key={s.valor} name="interv-masivo" valor={s.valor} seleccionado={estadoInterv} onSelect={setEstadoInterv} disabled={!nEditablesInterv} />
                ))}
              </div>
              <ObservacionBox t={t} value={obsInterv} onChange={setObsInterv} />
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <ResumenCambios
              filas={resumenMostrar}
              t={t}
              titulo={resumenPost?.length ? 'Cambios aplicados' : 'Vista previa de cambios'}
            />
          </div>

          {mensajeExito && (
            <div style={{ marginTop: 12, padding: `${cc.padSm} ${cc.pad}`, background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 8, color: '#166534', fontSize: cc.sm, fontWeight: 600 }}>
              {mensajeExito}
            </div>
          )}

          {errorApply && (
            <div style={{ marginTop: 12, padding: `${cc.padSm} ${cc.pad}`, background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, color: '#B91C1C', fontSize: cc.sm }}>
              {errorApply}
            </div>
          )}
        </div>

        <div className="cc-ppto-modal-footer" style={{ padding: `14px 22px`, borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 8, padding: `10px 20px`, color: t.textMuted, cursor: 'pointer', fontSize: cc.label }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={busy || (tabSafe === 'interv' ? nEditablesInterv === 0 : nEditables === 0)}
            style={{
              background: t.primary,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: `10px 24px`,
              fontWeight: 700,
              fontSize: cc.label,
              cursor: busy || nEditables === 0 ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Aplicando…' : 'Editar masivamente'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ObservacionBox({ value, onChange, t }) {
  return (
    <div>
      <div style={{ fontSize: cc.caption, fontWeight: 700, color: t.textMuted, marginBottom: 6, letterSpacing: 0.4 }}>
        ACTUALIZAR OBSERVACIÓN <span style={{ fontWeight: 500, opacity: 0.75 }}>(opcional)</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Texto para el informe Excel…"
        rows={3}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: t.inputBg,
          border: `1.5px solid ${t.border}`,
          borderRadius: 8,
          padding: `${cc.padSm} 12px`,
          color: t.text,
          fontSize: cc.sm,
          lineHeight: 1.45,
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
      <div style={{ fontSize: cc.caption, color: t.textMuted, marginTop: 6, lineHeight: 1.4 }}>{HINT_EXCEL_OBS}</div>
    </div>
  )
}
