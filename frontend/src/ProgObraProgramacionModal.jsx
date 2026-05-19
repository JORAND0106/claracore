/**
 * Modal de programación de obra (~90% × 85%): tabs PK, tabla con capítulos colapsables, Gantt Excel.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { flushSync } from 'react-dom'
import { RefreshCw } from 'lucide-react'
import {
  addCalendarDays,
  eachCalendarDay,
  fmtCOP,
  fmtCant,
  fmtDateHuman,
  fmtDateIso,
  isoFromDate,
  isWeekendDate,
  parseIsoDate,
  countDiasHabilesEnRango,
} from './progObraFormat'

const PROG_Z = 200000
const GANTT_DAY_PX = 18
const GANTT_ROW_ITEM = 32
const GANTT_ROW_CAP = 40
const GANTT_BAR_H = 20
const GANTT_NON_HABIL_BG = 'rgba(229, 231, 235, 0.6)'
const GANTT_TEAL = '#1D9E75'
const GANTT_TEAL_DARK = '#157a5c'
const GANTT_CAP_BAR = 'rgba(59, 130, 246, 0.3)'
const GANTT_RANGE_PAD_DAYS = 7
const STICKY_W = { item: 88, desc: 280 }

function monthYearLabel(d) {
  const month = d.toLocaleDateString('es-CO', { month: 'long' })
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${d.getFullYear()}`
}

function ganttBarTooltip({ isSummary, label, barStart, barEnd, duracion, diasHab }) {
  if (!barStart || !barEnd) return ''
  if (isSummary) {
    return `Capítulo — Inicio: ${fmtDateHuman(barStart)} — Fin: ${fmtDateHuman(barEnd)} — ${diasHab} días hábiles programados`
  }
  const dur = duracion > 0 ? duracion : '—'
  return `Ítem ${label} — Inicio: ${fmtDateHuman(barStart)} — Fin: ${fmtDateHuman(barEnd)} — ${dur} días hábiles`
}

function GanttRefreshButton({ onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      title="Actualizar diagrama Gantt"
      aria-label="Actualizar diagrama Gantt"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: 'none',
        background: hover ? 'rgba(29, 158, 117, 0.14)' : 'transparent',
        borderRadius: '50%',
        width: 32,
        height: 32,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: hover ? GANTT_TEAL_DARK : GANTT_TEAL,
        transform: hover ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.4s ease, color 0.2s ease, background 0.2s ease',
        padding: 0,
      }}
    >
      <RefreshCw size={18} strokeWidth={2.25} />
    </button>
  )
}

const CAP_PALETTE = [
  { bg: '#e8f4fc', border: '#b8d9f0', accent: '#5b9bd5' },
  { bg: '#f0fce8', border: '#c5e8b7', accent: '#6aaf50' },
  { bg: '#fdf6e8', border: '#ecd9b0', accent: '#c9a227' },
  { bg: '#f3ecfc', border: '#d4c4eb', accent: '#8b6cb8' },
  { bg: '#fceef0', border: '#e8c4cb', accent: '#c75b6a' },
  { bg: '#e8faf8', border: '#b8e8e2', accent: '#3d9e8f' },
]

function useDebounced(value, ms) {
  const [d, setD] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return d
}

function capColor(idx) {
  return CAP_PALETTE[idx % CAP_PALETTE.length]
}

/** Rango del capítulo: min fecha inicio, max fecha fin entre ítems con programación. */
function computeCapituloResumenGantt(capitulo, items, actMap, actividadKey, rowOverrides, noHabilesSet) {
  let minFi = null
  let maxFf = null
  for (const it of items) {
    const ov = rowOverrides[it.item]
    const act = actMap[actividadKey(capitulo, it.item, 1)]
    const fi = parseIsoDate(fmtDateIso(ov?.fecha_inicio ?? act?.fecha_inicio))
    const ff = parseIsoDate(fmtDateIso(ov?.fecha_fin ?? act?.fecha_fin_calculada))
    if (fi && (!minFi || fi < minFi)) minFi = fi
    if (ff && (!maxFf || ff > maxFf)) maxFf = ff
  }
  if (!minFi || !maxFf) return { summaryStart: null, summaryEnd: null, diasHab: 0 }
  const summaryStart = isoFromDate(minFi)
  const summaryEnd = isoFromDate(maxFf)
  const diasHab = countDiasHabilesEnRango(summaryStart, summaryEnd, noHabilesSet)
  return { summaryStart, summaryEnd, diasHab }
}

/** Rango de días del PK: min/max de fechas de ítems ± margen. */
function computePkTimelineDays(capitulosOrdenados, itemsPorCapitulo, actMap, actividadKey, getDraftValues) {
  let minD = null
  let maxD = null
  for (const cap of capitulosOrdenados) {
    for (const it of itemsPorCapitulo(cap)) {
      const act = actMap[actividadKey(cap, it.item, 1)]
      const draft = getDraftValues?.(cap, it.item)
      const fi = parseIsoDate(fmtDateIso(draft?.fecha_inicio ?? act?.fecha_inicio))
      const ff = parseIsoDate(fmtDateIso(draft?.fecha_fin ?? act?.fecha_fin_calculada))
      if (fi && (!minD || fi < minD)) minD = fi
      if (ff && (!maxD || ff > maxD)) maxD = ff
    }
  }
  if (!minD || !maxD) return []
  const from = addCalendarDays(minD, -GANTT_RANGE_PAD_DAYS)
  const to = addCalendarDays(maxD, GANTT_RANGE_PAD_DAYS)
  return eachCalendarDay(from, to)
}

function buildGanttSnap(capitulo, items, actMap, actividadKey, timelineDays, rowOverrides = {}, noHabilesSet = new Set()) {
  if (!timelineDays?.length) return null

  const rows = []
  for (const it of items) {
    const ov = rowOverrides[it.item]
    const act = actMap[actividadKey(capitulo, it.item, 1)]
    const fi = fmtDateIso(ov?.fecha_inicio ?? act?.fecha_inicio)
    const ff = fmtDateIso(ov?.fecha_fin ?? act?.fecha_fin_calculada)
    if (!fi || !ff) continue
    const dur = Number(ov?.duracion ?? act?.duracion_dias_habiles) || 0
    rows.push({ item: it.item, fecha_inicio: fi, fecha_fin: ff, duracion: dur })
  }
  if (rows.length === 0) return null

  const { summaryStart, summaryEnd, diasHab } = computeCapituloResumenGantt(
    capitulo,
    items,
    actMap,
    actividadKey,
    rowOverrides,
    noHabilesSet,
  )
  const days = timelineDays
  const from = days[0]
  const to = days[days.length - 1]

  return { days, rows, diasHab, from, to, summaryStart, summaryEnd }
}

function ProgChapterGanttExcel({ snap, noHabilesSet, t }) {
  if (!snap?.days?.length) return null

  const { days, rows, diasHab } = snap
  const fromT = days[0].getTime()
  const span = days.length
  const dayPx = GANTT_DAY_PX
  const labelW = STICKY_W.item + STICKY_W.desc
  const gridW = span * dayPx
  const monthRowH = 28
  const dayRowH = 26
  const bodyH = GANTT_ROW_CAP + rows.length * GANTT_ROW_ITEM
  const timelineH = monthRowH + dayRowH + bodyH

  const monthSpans = useMemo(() => {
    const spans = []
    let i = 0
    while (i < days.length) {
      const d = days[i]
      const m = d.getMonth()
      const y = d.getFullYear()
      let j = i + 1
      while (j < days.length && days[j].getMonth() === m && days[j].getFullYear() === y) j++
      spans.push({
        label: monthYearLabel(d),
        start: i,
        count: j - i,
      })
      i = j
    }
    return spans
  }, [days])

  const dayNonHabil = (d) => {
    const iso = isoFromDate(d)
    return isWeekendDate(d) || noHabilesSet.has(iso)
  }

  const summaryStart = snap.summaryStart
  const summaryEnd = snap.summaryEnd

  return (
    <div
      style={{
        marginTop: 10,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: t.bg,
        display: 'inline-block',
        width: labelW + gridW,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ overflowX: 'auto', width: labelW + gridW }}>
        <div style={{ width: labelW + gridW, flexShrink: 0 }}>
          <div style={{ display: 'flex', width: labelW + gridW }}>
            <div style={{ width: labelW, flexShrink: 0, background: t.bgCard, borderBottom: `1px solid ${t.border}` }}>
              <div style={{ height: monthRowH }} />
              <div style={{ height: dayRowH, borderTop: `1px solid ${t.border}44` }} />
            </div>
            <div style={{ position: 'relative', width: gridW, minWidth: gridW, maxWidth: gridW, flexShrink: 0 }}>
              {days.map((d, i) =>
                dayNonHabil(d) ? (
                  <div
                    key={`nh-${isoFromDate(d)}`}
                    style={{
                      position: 'absolute',
                      left: i * dayPx,
                      width: dayPx,
                      top: 0,
                      height: timelineH,
                      background: GANTT_NON_HABIL_BG,
                      pointerEvents: 'none',
                      zIndex: 0,
                    }}
                  />
                ) : null,
              )}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', height: monthRowH, borderBottom: `1px solid ${t.border}`, background: t.bgCard }}>
                  {monthSpans.map((ms, idx) => (
                    <div
                      key={`${ms.label}-${ms.start}`}
                      style={{
                        width: ms.count * dayPx,
                        minWidth: ms.count * dayPx,
                        flexShrink: 0,
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        textAlign: 'center',
                        fontSize: 'var(--cc-caption)',
                        fontWeight: 700,
                        color: t.text,
                        padding: '6px 4px',
                        borderLeft: idx > 0 ? `1px solid ${t.border}` : 'none',
                        lineHeight: 1.2,
                      }}
                      title={ms.label}
                    >
                      {ms.label}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', height: dayRowH, borderBottom: `1px solid ${t.border}`, background: t.bg }}>
                  {days.map((d) => (
                    <div
                      key={isoFromDate(d)}
                      style={{
                        width: dayPx,
                        minWidth: dayPx,
                        flexShrink: 0,
                        boxSizing: 'border-box',
                        fontSize: 11,
                        textAlign: 'center',
                        color: t.textMuted,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderLeft: `1px solid ${t.border}33`,
                      }}
                      title={d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
                    >
                      {d.getDate()}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <GanttBarRow
            label={`Σ ${diasHab} días-hábiles programados`}
            labelTitle="Rango del capítulo (fecha mínima de inicio a fecha máxima de fin). Los ítems pueden ejecutarse en paralelo."
            labelStyle={{ fontWeight: 700, color: t.primary }}
            rowHeight={GANTT_ROW_CAP}
            days={days}
            fromT={fromT}
            dayPx={dayPx}
            barStart={summaryStart}
            barEnd={summaryEnd}
            isSummary
            diasHab={diasHab}
            t={t}
          />

          {rows.map((r) => (
            <GanttBarRow
              key={r.item}
              label={r.item}
              rowHeight={GANTT_ROW_ITEM}
              days={days}
              fromT={fromT}
              dayPx={dayPx}
              barStart={r.fecha_inicio}
              barEnd={r.fecha_fin}
              duracion={r.duracion}
              t={t}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function GanttBarRow({ label, labelTitle, labelStyle, rowHeight, days, fromT, dayPx, barStart, barEnd, isSummary, duracion, diasHab, t }) {
  let left = 0
  let width = 0
  const fi = parseIsoDate(barStart)
  const ff = parseIsoDate(barEnd)
  if (fi && ff) {
    const startIdx = Math.max(0, Math.round((fi.getTime() - fromT) / 86400000))
    const endIdx = Math.min(days.length - 1, Math.round((ff.getTime() - fromT) / 86400000))
    left = startIdx * dayPx
    width = Math.max((endIdx - startIdx + 1) * dayPx, dayPx)
  }

  const tooltip = ganttBarTooltip({
    isSummary,
    label,
    barStart,
    barEnd,
    duracion,
    diasHab,
  })

  return (
    <div style={{ display: 'flex', height: rowHeight, borderBottom: `1px solid ${t.border}44`, alignItems: 'stretch' }}>
      <div
        style={{
          width: STICKY_W.item + STICKY_W.desc,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 8,
          fontSize: 'var(--cc-caption)',
          color: t.textMuted,
          ...labelStyle,
          position: 'sticky',
          left: 0,
          background: t.bgCard,
          zIndex: 2,
        }}
        title={labelTitle || undefined}
      >
        {label}
      </div>
      <div style={{ position: 'relative', width: days.length * dayPx, minWidth: days.length * dayPx, maxWidth: days.length * dayPx, flexShrink: 0 }}>
        {days.map((d, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: i * dayPx,
              width: dayPx,
              top: 0,
              bottom: 0,
              borderLeft: `1px solid ${t.border}22`,
              pointerEvents: 'none',
            }}
          />
        ))}
        {width > 0 && (
          <div
            style={{
              position: 'absolute',
              left,
              width,
              height: GANTT_BAR_H,
              top: '50%',
              transform: 'translateY(-50%)',
              borderRadius: 4,
              background: isSummary ? GANTT_CAP_BAR : GANTT_TEAL,
              boxSizing: 'border-box',
              zIndex: 2,
              cursor: 'default',
            }}
            title={tooltip}
          />
        )}
      </div>
    </div>
  )
}

function ProgItemRow({
  itemDef,
  act,
  rk,
  cid,
  token,
  API,
  t,
  editable,
  saveStatus,
  onGuardarItem,
  stickyBg,
  registerRowDraft,
  unregisterRowDraft,
  finOverride,
}) {
  const ex = act || {}
  const [fechaIni, setFechaIni] = useState(() => fmtDateIso(ex.fecha_inicio))
  const [duracion, setDuracion] = useState(ex.duracion_dias_habiles != null ? String(ex.duracion_dias_habiles) : '')
  const debDur = useDebounced(duracion, 320)
  const debFecha = useDebounced(fechaIni, 320)
  const [finCalc, setFinCalc] = useState(() => fmtDateIso(ex.fecha_fin_calculada))
  const dirtyRef = useRef(false)
  const actSyncKey = `${fmtDateIso(ex.fecha_inicio)}|${ex.duracion_dias_habiles ?? ''}|${fmtDateIso(ex.fecha_fin_calculada)}`

  useEffect(() => {
    if (dirtyRef.current) return
    setFechaIni(fmtDateIso(ex.fecha_inicio))
    setDuracion(ex.duracion_dias_habiles != null ? String(ex.duracion_dias_habiles) : '')
    setFinCalc(fmtDateIso(ex.fecha_fin_calculada))
  }, [actSyncKey, itemDef.capitulo, itemDef.item])

  useEffect(() => {
    if (finOverride == null || finOverride === '') return
    setFinCalc(fmtDateIso(finOverride))
  }, [finOverride])

  useEffect(() => {
    if (!registerRowDraft) return undefined
    registerRowDraft(rk, {
      getValues: () => ({
        fecha_inicio: fechaIni,
        duracion: duracion,
      }),
      setFin: (iso) => setFinCalc(fmtDateIso(iso)),
    })
    return () => unregisterRowDraft?.(rk)
  }, [rk, fechaIni, duracion, registerRowDraft, unregisterRowDraft])

  useEffect(() => {
    const d = parseInt(String(debDur), 10)
    if (!debFecha || !d || d < 1 || !cid || !token) {
      if (!dirtyRef.current) setFinCalc(fmtDateIso(ex.fecha_fin_calculada))
      return
    }
    let cancel = false
    const q = new URLSearchParams({ fecha_inicio: debFecha, duracion_dias_habiles: String(d) })
    fetch(`${API}/prog-obra/${cid}/calcular-fin?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancel) setFinCalc(j?.fecha_fin_calculada ? fmtDateIso(j.fecha_fin_calculada) : '')
      })
      .catch(() => {
        if (!cancel && !dirtyRef.current) setFinCalc(fmtDateIso(ex.fecha_fin_calculada))
      })
    return () => {
      cancel = true
    }
  }, [debFecha, debDur, cid, token, API, ex.fecha_fin_calculada])

  const trySave = useCallback(async () => {
    if (!editable || saveStatus === 'saving') return false
    const d = parseInt(String(duracion), 10)
    if (!fechaIni || !(d > 0)) return false
    const ok = await onGuardarItem(itemDef, { fecha_inicio: fechaIni, duracion: String(d), override_manual: true, heredado_de_capitulo: false }, rk)
    if (ok) dirtyRef.current = false
    return ok
  }, [editable, saveStatus, onGuardarItem, itemDef, fechaIni, duracion, rk])

  useEffect(() => {
    if (!editable || !dirtyRef.current) return undefined
    const d = parseInt(String(debDur), 10)
    if (!debFecha || !(d > 0)) return undefined
    const timer = setTimeout(() => trySave(), 700)
    return () => clearTimeout(timer)
  }, [debFecha, debDur, editable, trySave])

  const onBlurField = () => {
    if (dirtyRef.current) trySave()
  }

  const saveIcon =
    saveStatus === 'saving' ? (
      <span style={{ color: t.textMuted }}>…</span>
    ) : saveStatus === 'saved' ? (
      <span style={{ color: '#1D9E75', fontWeight: 700 }}>✓</span>
    ) : saveStatus === 'error' ? (
      <span style={{ color: '#b91c1c', fontWeight: 700 }}>!</span>
    ) : ex.heredado_de_capitulo ? (
      <span style={{ fontSize: 'var(--cc-caption)', color: '#1e40af' }} title="Heredado">
        H
      </span>
    ) : null

  const cell = {
    padding: '0 8px',
    fontSize: 'var(--cc-sm)',
    lineHeight: 1.35,
    verticalAlign: 'middle',
    height: 44,
    maxHeight: 44,
    overflow: 'hidden',
  }
  const sticky = { position: 'sticky', background: stickyBg, zIndex: 1 }

  return (
    <tr style={{ borderBottom: `1px solid ${t.border}` }}>
      <td style={{ ...cell, ...sticky, left: 0, fontWeight: 600, minWidth: STICKY_W.item, maxWidth: STICKY_W.item }} title={itemDef.item}>
        {itemDef.item}
      </td>
      <td style={{ ...cell, ...sticky, left: STICKY_W.item, minWidth: STICKY_W.desc, maxWidth: STICKY_W.desc, color: t.textMuted }} title={itemDef.descripcion}>
        {itemDef.descripcion || '—'}
      </td>
      <td style={{ ...cell, minWidth: 48 }}>{itemDef.und || '—'}</td>
      <td style={{ ...cell, textAlign: 'right', minWidth: 72 }}>{fmtCant(itemDef.cant_total)}</td>
      <td style={{ ...cell, textAlign: 'right', minWidth: 110, whiteSpace: 'nowrap' }}>{fmtCOP(itemDef.costo_directo)}</td>
      <td style={{ ...cell, minWidth: 148 }}>
        {editable ? (
          <input
            type="date"
            value={fechaIni}
            onChange={(e) => {
              dirtyRef.current = true
              setFechaIni(e.target.value)
            }}
            onBlur={onBlurField}
            style={{ width: '100%', fontSize: 'var(--cc-input)', padding: '4px 6px', boxSizing: 'border-box', border: `1px solid ${t.border}`, borderRadius: 4, background: t.bg }}
          />
        ) : (
          fmtDateIso(ex.fecha_inicio) || '—'
        )}
      </td>
      <td style={{ ...cell, minWidth: 64 }}>
        {editable ? (
          <input
            type="number"
            min={1}
            value={duracion}
            onChange={(e) => {
              dirtyRef.current = true
              setDuracion(e.target.value)
            }}
            onBlur={onBlurField}
            style={{ width: '100%', fontSize: 'var(--cc-input)', padding: '4px 6px', boxSizing: 'border-box', border: `1px solid ${t.border}`, borderRadius: 4, background: t.bg, textAlign: 'right' }}
          />
        ) : (
          ex.duracion_dias_habiles ?? '—'
        )}
      </td>
      <td style={{ ...cell, minWidth: 200, color: t.textMuted, whiteSpace: 'nowrap' }}>{fmtDateHuman(finCalc || ex.fecha_fin_calculada)}</td>
      <td style={{ ...cell, width: 28, textAlign: 'center' }}>{saveIcon}</td>
    </tr>
  )
}

function ProgCapituloSection({
  cap,
  capIdx,
  items,
  actMap,
  actividadKey,
  itemRowKey,
  collapsed,
  onToggleCollapse,
  onRefreshGantt,
  ganttSnap,
  hasAnyDates,
  editable,
  t,
  cid,
  token,
  API,
  rowSaveStatus,
  onHerencia,
  onGuardarCap,
  onGuardarItem,
  capCr,
  noHabilesSet,
  registerRowDraft,
  unregisterRowDraft,
  finOverrides,
  refreshGanttBusy,
}) {
  const pal = capColor(capIdx)
  const [fechaCap, setFechaCap] = useState(() => fmtDateIso(capCr?.fecha_inicio_sugerida))
  const [durCap, setDurCap] = useState(capCr?.duracion_dias_habiles != null ? String(capCr.duracion_dias_habiles) : '')
  const dirtyCap = useRef(false)

  useEffect(() => {
    if (dirtyCap.current) return
    setFechaCap(fmtDateIso(capCr?.fecha_inicio_sugerida))
    setDurCap(capCr?.duracion_dias_habiles != null ? String(capCr.duracion_dias_habiles) : '')
  }, [capCr?.fecha_inicio_sugerida, capCr?.duracion_dias_habiles, cap])

  const saveCap = async () => {
    if (!editable || !dirtyCap.current) return
    await onGuardarCap(cap, fechaCap || null, durCap)
    dirtyCap.current = false
  }

  return (
    <>
      <tr style={{ background: pal.bg, borderTop: `2px solid ${pal.border}` }}>
        <td colSpan={9} style={{ padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={!collapsed}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 'var(--cc-md)',
                color: pal.accent,
                padding: '0 4px',
                lineHeight: 1,
              }}
            >
              {collapsed ? '▸' : '▾'}
            </button>
            <span style={{ fontWeight: 700, color: t.text, fontSize: 'var(--cc-sm)' }}>{cap}</span>
            {hasAnyDates && <GanttRefreshButton onClick={onRefreshGantt} />}
            {editable && (
              <>
                <input
                  type="date"
                  value={fechaCap}
                  onChange={(e) => {
                    dirtyCap.current = true
                    setFechaCap(e.target.value)
                  }}
                  onBlur={saveCap}
                  title="Fecha inicio capítulo"
                  style={{ width: 132, fontSize: 'var(--cc-input)', padding: '4px 6px', border: `1px solid ${t.border}`, borderRadius: 4 }}
                />
                <input
                  type="number"
                  min={1}
                  value={durCap}
                  placeholder="Días"
                  onChange={(e) => {
                    dirtyCap.current = true
                    setDurCap(e.target.value)
                  }}
                  onBlur={saveCap}
                  style={{ width: 52, fontSize: 'var(--cc-input)', padding: '4px 6px', border: `1px solid ${t.border}`, borderRadius: 4, textAlign: 'right' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      if (dirtyCap.current) await saveCap()
                      onHerencia(cap)
                    })()
                  }}
                  style={{
                    marginLeft: 'auto',
                    padding: '4px 12px',
                    fontSize: 'var(--cc-caption)',
                    fontWeight: 700,
                    borderRadius: 6,
                    border: `1px solid ${pal.accent}`,
                    background: t.bgCard,
                    color: pal.accent,
                    cursor: 'pointer',
                  }}
                >
                  Aplicar herencia
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {!collapsed &&
        items.map((it) => (
          <ProgItemRow
            key={itemRowKey(cap, it.item)}
            itemDef={it}
            act={actMap[actividadKey(cap, it.item, 1)]}
            rk={itemRowKey(cap, it.item)}
            cid={cid}
            token={token}
            API={API}
            t={t}
            editable={editable}
            saveStatus={rowSaveStatus[itemRowKey(cap, it.item)] || 'idle'}
            onGuardarItem={onGuardarItem}
            stickyBg={t.bgCard}
            registerRowDraft={registerRowDraft}
            unregisterRowDraft={unregisterRowDraft}
            finOverride={finOverrides[itemRowKey(cap, it.item)]}
          />
        ))}
      {hasAnyDates && (
        <tr>
          <td colSpan={9} style={{ padding: '0 8px 12px', background: t.bg, width: 1 }}>
            {ganttSnap ? (
              <div style={{ display: 'inline-block', verticalAlign: 'top' }}>
                <ProgChapterGanttExcel snap={ganttSnap} noHabilesSet={noHabilesSet} t={t} />
              </div>
            ) : (
              <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, padding: '8px 4px' }}>
                {refreshGanttBusy ? 'Actualizando diagrama…' : 'Pulse el ícono de actualizar junto al capítulo para generar el Gantt.'}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export default function ProgObraProgramacionModal({
  open,
  onClose,
  t,
  workingVersion,
  pkTabs,
  activePk,
  onSelectPk,
  onRemovePk,
  capitulosOrdenados,
  itemsPorCapitulo,
  capProgMap,
  actMap,
  actividadKey,
  itemRowKey,
  editable,
  rowSaveStatus,
  onHerencia,
  onGuardarCap,
  onGuardarItem,
  onGuardarBatch,
  loadAct,
  loadPpto,
  cid,
  token,
  API,
  panelBusy,
  onGuardarCambios,
  onSaveSuccess,
  showToast,
}) {
  const [collapsedCaps, setCollapsedCaps] = useState({})
  const [ganttSnaps, setGanttSnaps] = useState({})
  const [noHabilesSet, setNoHabilesSet] = useState(new Set())
  const [finOverrides, setFinOverrides] = useState({})
  const [ganttRefreshCap, setGanttRefreshCap] = useState(null)
  const [localSaving, setLocalSaving] = useState(false)
  const [rowDrafts, setRowDrafts] = useState({})
  const rowDraftRef = useRef({})

  const registerRowDraft = useCallback((rk, api) => {
    rowDraftRef.current[rk] = api
    const v = api.getValues()
    setRowDrafts((prev) => ({ ...prev, [rk]: v }))
  }, [])

  const unregisterRowDraft = useCallback((rk) => {
    const api = rowDraftRef.current[rk]
    if (api) {
      const v = api.getValues()
      setRowDrafts((prev) => ({ ...prev, [rk]: v }))
    }
    delete rowDraftRef.current[rk]
  }, [])

  const versionTitle = workingVersion
    ? `Versión nº${workingVersion.numero_version} ${workingVersion.tipo || ''} ${workingVersion.estado || ''}`.trim()
    : 'Sin versión seleccionada'

  useEffect(() => {
    if (!open || !cid || !token) return
    const desde = new Date()
    const hasta = addCalendarDays(desde, 400)
    const q = new URLSearchParams({
      desde: isoFromDate(desde),
      hasta: isoFromDate(hasta),
    })
    fetch(`${API}/prog-obra/${cid}/calendario-no-habiles?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { fechas: [] }))
      .then((j) => setNoHabilesSet(new Set((j?.fechas || []).map((x) => String(x).slice(0, 10)))))
      .catch(() => setNoHabilesSet(new Set()))
  }, [open, cid, token, API])

  const toggleCap = (cap) => {
    const k = `${activePk}\u0000${cap}`
    setCollapsedCaps((s) => ({ ...s, [k]: !s[k] }))
  }

  const refreshGantt = async (cap) => {
    const items = itemsPorCapitulo(cap)
    const rowOverrides = {}
    const finPatch = {}

    for (const it of items) {
      const rk = itemRowKey(cap, it.item)
      const draft = rowDraftRef.current[rk]?.getValues?.()
      const act = actMap[actividadKey(cap, it.item, 1)]
      const fi = fmtDateIso(draft?.fecha_inicio ?? act?.fecha_inicio)
      const durRaw = draft?.duracion != null && draft.duracion !== '' ? draft.duracion : act?.duracion_dias_habiles
      const dur = parseInt(String(durRaw), 10)

      if (!fi || !(dur > 0)) continue

      let ff = fmtDateIso(act?.fecha_fin_calculada)
      try {
        const q = new URLSearchParams({ fecha_inicio: fi, duracion_dias_habiles: String(dur) })
        const res = await fetch(`${API}/prog-obra/${cid}/calcular-fin?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const j = await res.json()
          ff = fmtDateIso(j?.fecha_fin_calculada)
        }
      } catch {
        /* mantener ff previo */
      }

      if (ff) {
        rowOverrides[it.item] = { fecha_inicio: fi, fecha_fin: ff, duracion: dur }
        finPatch[rk] = ff
        rowDraftRef.current[rk]?.setFin?.(ff)
      }
    }

    if (Object.keys(finPatch).length > 0) {
      setFinOverrides((s) => ({ ...s, ...finPatch }))
    }

    const getDraft = (c, it) => {
      const rk = itemRowKey(c, it.item)
      const draft = rowDraftRef.current[rk]?.getValues?.()
      return {
        fecha_inicio: draft?.fecha_inicio,
        fecha_fin: finPatch[rk] || finOverrides[rk],
      }
    }
    const timelineDays = computePkTimelineDays(capitulosOrdenados, itemsPorCapitulo, actMap, actividadKey, getDraft)
    const snap = buildGanttSnap(cap, items, actMap, actividadKey, timelineDays, rowOverrides, noHabilesSet)
    if (!snap) {
      showToast?.('Asigne fechas a al menos un ítem del capítulo para generar el Gantt.', 'err')
      return
    }
    const k = `${activePk}\u0000${cap}`
    setGanttSnaps((prev) => ({ ...prev, [k]: snap }))
  }

  const handleRefreshGanttClick = (cap) => {
    setGanttRefreshCap(cap)
    refreshGantt(cap).finally(() => setGanttRefreshCap(null))
  }

  const collectDraftItems = useCallback(() => {
    const itemsAGuardar = []
    let skipped = 0
    for (const cap of capitulosOrdenados) {
      for (const it of itemsPorCapitulo(cap)) {
        const rk = itemRowKey(cap, it.item)
        const live = rowDraftRef.current[rk]?.getValues?.()
        const stored = rowDrafts[rk]
        const act = actMap[actividadKey(cap, it.item, 1)]
        const fecha = fmtDateIso(live?.fecha_inicio ?? stored?.fecha_inicio ?? act?.fecha_inicio)
        const durRaw = live?.duracion ?? stored?.duracion ?? act?.duracion_dias_habiles
        const dur = parseInt(String(durRaw), 10)
        if (!fecha || !(dur > 0)) {
          skipped += 1
          continue
        }
        itemsAGuardar.push({
          itemDef: it,
          rk,
          fecha_inicio: fecha,
          duracion: dur,
        })
      }
    }
    return { itemsAGuardar, skipped }
  }, [capitulosOrdenados, itemsPorCapitulo, actMap, actividadKey, itemRowKey, rowDrafts])

  const flushAllDrafts = useCallback(async () => {
    if (!editable) return { saved: 0, errors: 0, skipped: 0 }
    const { itemsAGuardar, skipped } = collectDraftItems()
    if (itemsAGuardar.length === 0) return { saved: 0, errors: 0, skipped }
    if (onGuardarBatch) {
      const batchPayload = itemsAGuardar.map((row) => ({
        capitulo: row.itemDef.capitulo,
        item: row.itemDef.item,
        fecha_inicio: row.fecha_inicio,
        duracion: row.duracion,
        override_manual: true,
        heredado_de_capitulo: false,
        itemDef: row.itemDef,
        rk: row.rk,
      }))
      const batchResult = await onGuardarBatch(batchPayload, activePk)
      if (!batchResult?.ok) return { saved: 0, errors: batchResult?.errors || batchPayload.length, skipped }
      return { saved: batchResult.saved, errors: 0, skipped, batchOk: true, pkId: batchResult.pkId }
    }
    let saved = 0
    let errors = 0
    for (const row of itemsAGuardar) {
      const ok = await onGuardarItem(
        row.itemDef,
        {
          fecha_inicio: row.fecha_inicio,
          duracion: String(row.duracion),
          override_manual: true,
          heredado_de_capitulo: false,
        },
        row.rk,
        { deferReload: true },
      )
      if (ok) saved += 1
      else errors += 1
    }
    return { saved, errors, skipped }
  }, [editable, collectDraftItems, onGuardarBatch, onGuardarItem, activePk])

  const handleGuardarClick = async () => {
    if (localSaving) return
    if (panelBusy) {
      showToast?.('Espere a que termine la operación en curso.', 'err')
      return
    }
    if (!editable) {
      showToast?.('Seleccione una versión en borrador con permiso de edición.', 'err')
      return
    }
    setLocalSaving(true)
    const prevCollapsed = collapsedCaps
    try {
      flushSync(() => {
        setCollapsedCaps((s) => {
          const next = { ...s }
          for (const cap of capitulosOrdenados) {
            next[`${activePk}\u0000${cap}`] = false
          }
          return next
        })
      })
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const { saved, errors, skipped, batchOk, pkId } = await flushAllDrafts()
      if (saved === 0 && skipped > 0) {
        throw new Error('Ningún ítem tiene fecha y días hábiles válidos. Revise la tabla.')
      }
      if (errors > 0) {
        throw new Error(`No se pudieron guardar ${errors} ítem(s).`)
      }
      if (saved > 0) {
        showToast?.(`Guardados ${saved} ítem(s).`, 'ok')
      }
      // Siempre notificar al padre — él cierra el modal y refresca mapa
      if (batchOk && onSaveSuccess) {
        await onSaveSuccess(pkId || activePk)
      } else {
        await onGuardarCambios?.()
      }
    } catch (e) {
      console.error('[ProgObra] Guardar cambios:', e)
      showToast?.(e?.message || 'Error al guardar cambios', 'err')
    } finally {
      setCollapsedCaps(prevCollapsed)
      setLocalSaving(false)
    }
  }

  const capHasDates = useCallback(
    (cap) => {
      for (const it of itemsPorCapitulo(cap)) {
        const act = actMap[actividadKey(cap, it.item, 1)]
        if (fmtDateIso(act?.fecha_inicio)) return true
      }
      return false
    },
    [itemsPorCapitulo, actMap, actividadKey],
  )

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: PROG_Z,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2vh 2vw',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '90vw',
          height: '85vh',
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: t.bgCard,
          borderRadius: 12,
          border: `1px solid ${t.border}`,
          boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          fontSize: 'var(--cc-sm)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--cc-md)', color: t.primary }}>Programación de obra — {versionTitle}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              color: t.textMuted,
              padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: `1px solid ${t.border}`, flexShrink: 0, overflowX: 'auto' }}>
          {pkTabs.map((pk) => (
            <button
              key={pk}
              type="button"
              onClick={() => onSelectPk(pk)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: `1px solid ${activePk === pk ? t.primary : t.border}`,
                background: activePk === pk ? `${t.primary}22` : t.bg,
                color: activePk === pk ? t.primary : t.text,
                fontWeight: activePk === pk ? 700 : 500,
                fontSize: 'var(--cc-sm)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              PK {pk}
              {pkTabs.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemovePk(pk)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && onRemovePk(pk)}
                  style={{ marginLeft: 8, color: t.textMuted, fontWeight: 400 }}
                >
                  ×
                </span>
              )}
            </button>
          ))}
          <span style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', padding: '0 8px' }}>+ Agregar PK (clic en el mapa)</span>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 16px' }}>
          {(loadPpto || loadAct) && <div style={{ color: t.textMuted, marginBottom: 8 }}>Cargando datos del PK…</div>}
          {!loadPpto && capitulosOrdenados.length === 0 && (
            <div style={{ color: t.textMuted }}>Sin ítems de presupuesto para este PK.</div>
          )}
          {capitulosOrdenados.length > 0 && (
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%' }}>
                <thead>
                  <tr style={{ background: t.bg, borderBottom: `2px solid ${t.border}` }}>
                    {['Ítem', 'Descripción', 'Und', 'Cantidad', 'Costo Directo', 'Fecha inicio', 'Días hábiles', 'Fecha fin', ''].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 10px',
                          fontSize: 'var(--cc-caption)',
                          fontWeight: 700,
                          color: t.textMuted,
                          textAlign: i >= 3 && i <= 4 ? 'right' : 'left',
                          position: i < 2 ? 'sticky' : 'static',
                          left: i === 0 ? 0 : i === 1 ? STICKY_W.item : undefined,
                          background: t.bg,
                          zIndex: i < 2 ? 3 : 1,
                          minWidth: i === 0 ? STICKY_W.item : i === 1 ? STICKY_W.desc : undefined,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {capitulosOrdenados.map((cap, capIdx) => {
                    const capKey = `${activePk}\u0000${cap}`
                    const items = itemsPorCapitulo(cap)
                    const collapsed = !!collapsedCaps[capKey]
                    const hasDates = capHasDates(cap)
                    return (
                      <ProgCapituloSection
                        key={cap}
                        cap={cap}
                        capIdx={capIdx}
                        items={items}
                        actMap={actMap}
                        actividadKey={actividadKey}
                        itemRowKey={itemRowKey}
                        collapsed={collapsed}
                        onToggleCollapse={() => toggleCap(cap)}
                        onRefreshGantt={() => handleRefreshGanttClick(cap)}
                        ganttSnap={ganttSnaps[capKey]}
                        hasAnyDates={hasDates}
                        editable={editable}
                        t={t}
                        cid={cid}
                        token={token}
                        API={API}
                        rowSaveStatus={rowSaveStatus}
                        onHerencia={onHerencia}
                        onGuardarCap={onGuardarCap}
                        onGuardarItem={onGuardarItem}
                        capCr={capProgMap[cap]}
                        noHabilesSet={noHabilesSet}
                        registerRowDraft={registerRowDraft}
                        unregisterRowDraft={unregisterRowDraft}
                        finOverrides={finOverrides}
                        refreshGanttBusy={ganttRefreshCap === cap}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'center',
            padding: '12px 16px',
            borderTop: `1px solid ${t.border}`,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            disabled={panelBusy || localSaving}
            onClick={() => void handleGuardarClick()}
            style={{
              padding: '8px 16px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 600,
              borderRadius: 8,
              border: `1px solid ${t.border}`,
              background: t.bg,
              color: t.text,
              cursor: panelBusy ? 'not-allowed' : 'pointer',
            }}
          >
            {localSaving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
