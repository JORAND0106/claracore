import { useMemo, useState, useEffect, useRef } from 'react'
import { formatCOP } from '../../utils/formatCOP'
import { idsRangoSeleccion } from './pptoSeleccionRango'
import {
  pptoConstruirTramosUnicos,
  pptoFiltrarTramosUnicos,
  pptoFilasDetalleTramo,
  pptoOrigenTramoBadgeStyle,
} from './pptoTramoBusqueda'
import { PPTO_TRAMOS_COMPETENCIA_AYUDA } from './pptoSubcontratistaMasiva'
import { pptoSheetStyles, pptoSheetTipStyle } from './pptoSheetStyles'
import { PPTO_MASIVA_TIP_TRAMOS_LISTA } from './pptoEdicionMasivaTips'

const cc = {
  caption: 'var(--cc-caption)',
  sm: 'var(--cc-sm)',
  label: 'var(--cc-label)',
  md: 'var(--cc-md)',
  pad: 'var(--cc-space-3)',
  padSm: 'var(--cc-space-2)',
}

/**
 * Tab Tramos de edición masiva — misma lógica que el botón «Tramos»:
 * pares `no_inicio → no_final` sobre registros cargados con fObra
 * (`pptoEp().list` / conteo), luego lista → detalle.
 * Presentación: hoja Excel (pptoSheetStyles).
 */
export default function PptoEdicionMasivaTramosPanel({
  t,
  sheet: sheetProp,
  filasFuente = [],
  cargando = false,
  meta = null,
  esSellado,
  tramoSelec,
  onSelectTramo,
  tramosSelIds,
  setTramosSelIds,
  editCompetenciaTramos,
  setEditCompetenciaTramos,
  competenciasOpciones = [],
  busy = false,
  onAplicar,
}) {
  const sheet = sheetProp || pptoSheetStyles(t)
  const [busqueda, setBusqueda] = useState('')

  const tramosUnicos = useMemo(
    () => pptoConstruirTramosUnicos(filasFuente),
    [filasFuente],
  )

  const tramosFiltrados = useMemo(
    () => pptoFiltrarTramosUnicos(tramosUnicos, busqueda),
    [tramosUnicos, busqueda],
  )

  const filasTramo = useMemo(
    () => pptoFilasDetalleTramo(filasFuente, tramoSelec),
    [filasFuente, tramoSelec],
  )

  /** Orden visual de registros (NI → TR → NF) para Shift+rango y «seleccionar todos». */
  const registrosLista = useMemo(
    () => filasTramo.map(({ registro }) => registro),
    [filasTramo],
  )

  const lastSelAnchorIdRef = useRef(null)

  const tramoIdx = useMemo(() => {
    if (!tramoSelec) return -1
    return tramosUnicos.findIndex(
      (tr) => tr.no_inicio === tramoSelec.no_inicio && tr.no_final === tramoSelec.no_final,
    )
  }, [tramosUnicos, tramoSelec])

  useEffect(() => {
    if (!tramoSelec) {
      setTramosSelIds(new Set())
      lastSelAnchorIdRef.current = null
      return
    }
    const valid = new Set(registrosLista.map((r) => r.id))
    setTramosSelIds((prev) => {
      const next = new Set()
      for (const id of prev) {
        if (valid.has(id)) next.add(id)
      }
      return next
    })
  }, [tramoSelec, registrosLista, setTramosSelIds])

  const irRelativo = (delta) => {
    if (tramoIdx < 0) return
    const dest = tramosUnicos[tramoIdx + delta]
    if (!dest) return
    setBusqueda('')
    onSelectTramo(dest)
  }

  const idsTodos = registrosLista.map((r) => r.id)
  const todosSel = idsTodos.length > 0 && idsTodos.every((id) => tramosSelIds.has(id))
  const algunosSel = !todosSel && idsTodos.some((id) => tramosSelIds.has(id))
  const nSellados = registrosLista.filter((r) => typeof esSellado === 'function' && esSellado(r)).length

  function toggleTodosTramo() {
    if (todosSel) {
      setTramosSelIds(new Set())
      lastSelAnchorIdRef.current = null
      return
    }
    setTramosSelIds(new Set(idsTodos))
    if (idsTodos.length) lastSelAnchorIdRef.current = idsTodos[idsTodos.length - 1]
  }

  /** Misma lógica que la grilla: Shift+clic marca el rango desde el ancla. */
  function onChkClick(id, e) {
    e.stopPropagation()
    if (e.shiftKey && lastSelAnchorIdRef.current != null) {
      e.preventDefault()
      // Competencia admite sellados → no omitir filas selladas en el rango.
      const ids = idsRangoSeleccion(registrosLista, lastSelAnchorIdRef.current, id, () => false)
      if (ids.length) {
        setTramosSelIds((prev) => {
          const next = new Set(prev)
          ids.forEach((i) => next.add(i))
          return next
        })
      }
      lastSelAnchorIdRef.current = id
    }
  }

  function onChkChange(id, e) {
    if (e?.shiftKey) return
    setTramosSelIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastSelAnchorIdRef.current = id
  }

  const navBtn = (disabled) => ({
    background: disabled ? t.bg : t.bgCard,
    border: `1px solid ${disabled ? sheet.border : t.primary + '55'}`,
    borderRadius: 4,
    padding: '5px 12px',
    fontSize: cc.sm,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? t.textMuted : t.primary,
    opacity: disabled ? 0.45 : 1,
    whiteSpace: 'nowrap',
  })

  if (cargando) {
    return (
      <div style={{ ...sheet.tdMuted, padding: 20, textAlign: 'center', border: `1px dashed ${sheet.border}` }}>
        Cargando tramos…
      </div>
    )
  }

  // ── Vista lista ──────────────────────────────────────────────────────────
  if (!tramoSelec) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={sheet.sectionBar}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Tramos disponibles
            <span title={PPTO_MASIVA_TIP_TRAMOS_LISTA} aria-label={PPTO_MASIVA_TIP_TRAMOS_LISTA} style={pptoSheetTipStyle(sheet)}>?</span>
            <span style={{
              marginLeft: 4,
              background: t.primary + '22',
              color: t.primary,
              borderRadius: 20,
              padding: '1px 8px',
              fontSize: cc.caption,
              fontWeight: 700,
            }}>
              {tramosUnicos.length}
            </span>
          </span>
          {meta?.cap && (
            <span style={{ fontSize: cc.caption, color: t.textMuted, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
              Cap: {meta.cap}{meta.fuente === 'api' ? ' · fObra' : ''}
            </span>
          )}
        </div>
        <div style={sheet.sheetWrapFlush}>
          {(meta?.aviso || meta?.error) && (
            <div style={{
              ...sheet.td,
              color: meta.error ? '#B91C1C' : '#D97706',
              background: meta.error ? '#FEE2E2' : '#FEF9C3',
              fontSize: cc.caption,
            }}>
              {meta.error || meta.aviso}
            </div>
          )}
          <div style={{ ...sheet.td, padding: 6 }}>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar nodo inicio / fin…"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: sheet.text,
                fontSize: 'var(--cc-input)',
                padding: '4px 2px',
              }}
            />
          </div>
          {tramosUnicos.length === 0 ? (
            <div style={{ ...sheet.tdMuted, padding: 16, textAlign: 'center', fontStyle: 'italic' }}>
              No hay tramos definidos en este capítulo
            </div>
          ) : tramosFiltrados.length === 0 ? (
            <div style={{ ...sheet.tdMuted, padding: 12, textAlign: 'center', fontStyle: 'italic' }}>
              Sin coincidencias para «{busqueda.trim()}».
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table style={{ ...sheet.sheetTable, minWidth: 0, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={sheet.th}>Tramo</th>
                    <th style={{ ...sheet.th, width: 72, textAlign: 'right' }}>Regs.</th>
                  </tr>
                </thead>
                <tbody>
                  {tramosFiltrados.map((tr) => {
                    const nRegs = pptoFilasDetalleTramo(filasFuente, tr).length
                    return (
                      <tr
                        key={tr.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setBusqueda(''); onSelectTramo(tr) }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setBusqueda('')
                            onSelectTramo(tr)
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ ...sheet.td, fontWeight: 700 }}>{tr.label}</td>
                        <td style={{ ...sheet.tdMuted, textAlign: 'right' }}>{nRegs}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Vista detalle ────────────────────────────────────────────────────────
  const puedeAplicar = tramosSelIds.size > 0 && !!String(editCompetenciaTramos || '').trim() && !busy

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onSelectTramo(null)}
          style={{
            background: 'transparent',
            border: `1px solid ${sheet.border}`,
            borderRadius: 4,
            padding: '5px 12px',
            fontSize: cc.sm,
            cursor: 'pointer',
            color: t.textMuted,
          }}
        >
          ← Volver
        </button>
        {tramosUnicos.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" disabled={tramoIdx <= 0} onClick={() => irRelativo(-1)} style={navBtn(tramoIdx <= 0)}>‹ Ant.</button>
            <span style={{ fontSize: cc.caption, color: t.textMuted, fontWeight: 600 }}>{tramoIdx + 1}/{tramosUnicos.length}</span>
            <button type="button" disabled={tramoIdx < 0 || tramoIdx >= tramosUnicos.length - 1} onClick={() => irRelativo(1)} style={navBtn(tramoIdx < 0 || tramoIdx >= tramosUnicos.length - 1)}>Sig. ›</button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 0 }}>
        <div style={sheet.sectionBar}>
          <span>
            {tramoSelec.label}
            <span style={{ marginLeft: 8, fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: t.textMuted }}>
              {filasTramo.length} reg. · {tramosSelIds.size} sel.
              {nSellados > 0 ? ` · ${nSellados} sellado(s)` : ''}
              {' · '}
              <span title="Shift+clic selecciona un rango">Shift+clic = rango</span>
            </span>
          </span>
        </div>
        <div style={sheet.sheetWrapFlush}>
          <table style={{ ...sheet.sheetTable, minWidth: 0, width: '100%' }}>
            <thead>
              <tr>
                <th style={sheet.th}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Competencia
                    <span title={PPTO_TRAMOS_COMPETENCIA_AYUDA} aria-label={PPTO_TRAMOS_COMPETENCIA_AYUDA} style={pptoSheetTipStyle(sheet)}>?</span>
                  </span>
                </th>
                <th style={{ ...sheet.th, width: 160 }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={sheet.td}>
                  <select
                    value={editCompetenciaTramos}
                    onChange={(e) => setEditCompetenciaTramos(e.target.value)}
                    disabled={busy}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: editCompetenciaTramos ? `${t.primary}12` : 'transparent',
                      color: sheet.text,
                      fontSize: 'var(--cc-input)',
                      padding: '6px 4px',
                      minHeight: 32,
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">— Seleccione —</option>
                    {(competenciasOpciones || []).map((c) => {
                      const val = typeof c === 'string' ? c : (c?.value ?? c?.nombre ?? '')
                      const lab = typeof c === 'string' ? c : (c?.label ?? c?.nombre ?? val)
                      return <option key={val} value={val}>{lab}</option>
                    })}
                  </select>
                </td>
                <td style={sheet.td}>
                  <button
                    type="button"
                    onClick={() => onAplicar?.()}
                    disabled={!puedeAplicar}
                    style={{
                      background: puedeAplicar ? t.primary : t.bgCard,
                      color: puedeAplicar ? '#fff' : t.textMuted,
                      border: puedeAplicar ? 'none' : `1px solid ${sheet.border}`,
                      borderRadius: 4,
                      padding: '8px 12px',
                      fontWeight: 700,
                      fontSize: cc.sm,
                      cursor: puedeAplicar ? 'pointer' : 'not-allowed',
                      opacity: busy ? 0.7 : 1,
                      width: '100%',
                    }}
                  >
                    {busy ? 'Aplicando…' : 'Aplicar'}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          {filasTramo.length === 0 ? (
            <div style={{ ...sheet.tdMuted, padding: 12 }}>No hay registros en este tramo.</div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table style={{ ...sheet.sheetTable, minWidth: 640, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...sheet.th, width: 36 }} title="Seleccionar todos">
                      <input
                        type="checkbox"
                        checked={todosSel}
                        ref={(el) => { if (el) el.indeterminate = algunosSel }}
                        disabled={!idsTodos.length}
                        onChange={toggleTodosTramo}
                        aria-label="Seleccionar todos"
                        style={{ width: 16, height: 16, accentColor: t.primary, cursor: idsTodos.length ? 'pointer' : 'default' }}
                      />
                    </th>
                    {[
                      { h: 'ID_POL', align: 'left' },
                      { h: 'Ítem', align: 'left' },
                      { h: 'Descripción', align: 'left' },
                      { h: 'Cant.', align: 'right' },
                      { h: 'C. directo', align: 'right' },
                      { h: 'Competencia', align: 'left' },
                      { h: 'Origen', align: 'center' },
                    ].map(({ h, align }) => (
                      <th key={h} style={{ ...sheet.th, textAlign: align }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filasTramo.map(({ registro: r, origen }) => {
                    const sellado = typeof esSellado === 'function' && esSellado(r)
                    const checked = tramosSelIds.has(r.id)
                    const badge = pptoOrigenTramoBadgeStyle(origen)
                    return (
                      <tr key={`${origen}-${r.id}`} style={{ background: sellado ? (t.bg || 'transparent') : undefined }}>
                        <td style={{ ...sheet.td, width: 36 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            title={sellado
                              ? 'Sellado: se puede cambiar competencia (Shift+clic = rango)'
                              : 'Marque filas (Shift+clic = rango)'}
                            onClick={(e) => onChkClick(r.id, e)}
                            onChange={(e) => onChkChange(r.id, e)}
                            style={{ width: 16, height: 16, accentColor: t.primary, cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ ...sheet.tdEllipsis, fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: sheet.text }} title={String(r.id_pol || r.pk_id || '')}>
                          {r.id_pol || r.pk_id || '—'}
                          {sellado ? <span style={{ marginLeft: 6, color: t.textMuted }} title="Sellado">🔒</span> : null}
                        </td>
                        <td style={{ ...sheet.td, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.item || '—'}</td>
                        <td style={sheet.tdEllipsis} title={r.descripcion || ''}>{r.descripcion || '—'}</td>
                        <td style={{ ...sheet.td, textAlign: 'right' }}>
                          {r.cant_total != null
                            ? Number(r.cant_total).toLocaleString('es-CO', { maximumFractionDigits: 2 })
                            : '—'}
                        </td>
                        <td style={{ ...sheet.td, textAlign: 'right' }}>
                          {r.costo_directo != null ? formatCOP(r.costo_directo) : '—'}
                        </td>
                        <td style={sheet.td}>{r.competencia || '—'}</td>
                        <td style={{ ...sheet.td, textAlign: 'center' }}>
                          <span
                            title={badge.title}
                            style={{
                              display: 'inline-block',
                              background: badge.bg,
                              color: badge.color,
                              borderRadius: 4,
                              padding: '2px 8px',
                              fontSize: cc.caption,
                              fontWeight: 800,
                              letterSpacing: 0.4,
                            }}
                          >
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
