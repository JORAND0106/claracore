/**
 * Modal de programación de obra (~90% × 85%): tabs PK, tabla con capítulos colapsables, Gantt Excel.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { flushSync } from 'react-dom'
import { RefreshCw } from 'lucide-react'
import ProgObraDependencias from './ProgObraDependencias'
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
const ROW_H = { cap: 44, agrupador: 44, hijo: 32, sinAg: 32, item: 44 }
const PANEL_LEFT = '45%'
const PANEL_RIGHT = '55%'
const GANTT_LABEL_W = 160
const GANTT_TIMELINE_H = 54
const TABLE_HEAD_H = GANTT_TIMELINE_H

function defaultTimelineDays() {
  const from = addCalendarDays(new Date(), -GANTT_RANGE_PAD_DAYS)
  const to = addCalendarDays(new Date(), 120)
  return eachCalendarDay(from, to)
}

/** Fechas efectivas de una fila (borrador en memoria > actMap > fin local). */
function resolveRowSchedule({
  cap,
  itemKey,
  rk,
  actMap,
  actividadKey,
  rowDraftRef,
  finOverrides,
  calcFinLocal,
}) {
  const draft = rowDraftRef.current?.[rk]?.getValues?.()
  const act = actMap[actividadKey(cap, itemKey, 1)]
  const fi = fmtDateIso(draft != null ? (draft.fecha_inicio || '') : act?.fecha_inicio)
  const durRaw = draft != null
    ? (draft.duracion != null && draft.duracion !== '' ? draft.duracion : null)
    : act?.duracion_dias_habiles
  const dur = durRaw != null ? parseInt(String(durRaw), 10) : NaN
  if (!fi || !(dur > 0)) return { fi: null, ff: null, dur: 0 }
  const ff = fmtDateIso(draft?.fecha_fin ?? finOverrides?.[rk] ?? act?.fecha_fin_calculada) || calcFinLocal?.(fi, dur)
  return { fi, ff: ff || null, dur }
}

/** Consolidado del capítulo: min inicio, max fin, días hábiles reales entre ambas. */
function computeCapConsolidado({
  cap,
  estructuraCap,
  items,
  agrupadorActItem,
  agrupadorRowKey,
  itemRowKey,
  actMap,
  actividadKey,
  rowDraftRef,
  finOverrides,
  calcFinLocal,
  noHabilesSet,
}) {
  const agrupadores = estructuraCap?.agrupadores || []
  const iter = agrupadores.length
    ? agrupadores.map((ag) => ({
      itemKey: agrupadorActItem(ag),
      rk: agrupadorRowKey(cap, ag),
    }))
    : items.map((it) => ({ itemKey: it.item, rk: itemRowKey(cap, it.item) }))
  let minFi = null
  let maxFf = null
  let cantTotal = 0
  let costoTotal = 0
  for (const { itemKey, rk } of iter) {
    const { fi, ff } = resolveRowSchedule({
      cap, itemKey, rk, actMap, actividadKey, rowDraftRef, finOverrides, calcFinLocal,
    })
    if (fi && (!minFi || fi < minFi)) minFi = fi
    if (ff && (!maxFf || ff > maxFf)) maxFf = ff
  }
  if (agrupadores.length) {
    for (const ag of agrupadores) {
      cantTotal += Number(ag.cant_total) || 0
      costoTotal += Number(ag.costo_directo) || 0
    }
  } else {
    for (const it of items) {
      cantTotal += Number(it.cant_total) || 0
      costoTotal += Number(it.costo_directo) || 0
    }
  }
  const diasHab = minFi && maxFf ? countDiasHabilesEnRango(minFi, maxFf, noHabilesSet) : null
  return {
    fecha_inicio: minFi,
    fecha_fin: maxFf,
    dias_habiles: diasHab,
    cant_total: cantTotal,
    costo_directo: costoTotal,
  }
}

/** Filas alineadas tabla ↔ Gantt + timeline del PK. */
function buildPkGanttLayout({
  capitulosOrdenados,
  activePk,
  collapsedCaps,
  expandedAgs,
  estructuraPorCapitulo,
  itemsPorCapitulo,
  actMap,
  actividadKey,
  agrupadorActItem,
  agrupadorRowKey,
  itemRowKey,
  rowDraftRef,
  finOverrides,
  calcFinLocal,
  noHabilesSet,
}) {
  const syncRows = []
  const getDraft = (c, itemCode) => {
    const eCap = estructuraPorCapitulo?.[c]
    const agMatch = (eCap?.agrupadores || []).find((ag) => agrupadorActItem(ag) === itemCode)
    const rk = agMatch ? agrupadorRowKey(c, agMatch) : itemRowKey(c, itemCode)
    return resolveRowSchedule({
      cap: c,
      itemKey: itemCode,
      rk,
      actMap,
      actividadKey,
      rowDraftRef,
      finOverrides,
      calcFinLocal,
    })
  }

  for (let capIdx = 0; capIdx < capitulosOrdenados.length; capIdx++) {
    const cap = capitulosOrdenados[capIdx]
    const capKey = `${activePk}\u0000${cap}`
    const collapsed = !!collapsedCaps[capKey]
    const estructuraCap = estructuraPorCapitulo?.[cap]
    const items = itemsPorCapitulo(cap)
    const agrupadores = estructuraCap?.agrupadores || []
    const sinAgrupador = estructuraCap?.sin_agrupador || []
    const useWbs = agrupadores.length > 0 || sinAgrupador.length > 0
    const capResumen = computeCapConsolidado({
      cap,
      estructuraCap,
      items,
      agrupadorActItem,
      agrupadorRowKey,
      itemRowKey,
      actMap,
      actividadKey,
      rowDraftRef,
      finOverrides,
      calcFinLocal,
      noHabilesSet,
    })

    syncRows.push({
      key: `cap-${cap}`,
      kind: 'cap',
      cap,
      capIdx,
      height: ROW_H.cap,
      label: `Σ Capítulo ${cap}`,
      barStart: capResumen.fecha_inicio,
      barEnd: capResumen.fecha_fin,
      diasHab: capResumen.dias_habiles ?? 0,
      isSummary: true,
    })

    if (collapsed) continue

    if (useWbs) {
      for (const ag of agrupadores) {
        const actItem = agrupadorActItem(ag)
        const rk = agrupadorRowKey(cap, ag)
        const sched = resolveRowSchedule({
          cap, itemKey: actItem, rk, actMap, actividadKey, rowDraftRef, finOverrides, calcFinLocal,
        })
        const label = `${ag.codigo_wbs || actItem}${ag.agrupador_nombre ? ` · ${ag.agrupador_nombre}` : ''}`
        syncRows.push({
          key: `ag-${ag.agrupador_id}`,
          kind: 'ag',
          cap,
          height: ROW_H.agrupador,
          label: ag.codigo_wbs || actItem,
          labelTitle: label,
          barStart: sched.fi,
          barEnd: sched.ff,
          duracion: sched.dur,
          isSummary: false,
        })
        const agExpKey = `${activePk}\u0000${cap}\u0000${ag.agrupador_id}`
        if (expandedAgs[agExpKey]) {
          for (const hijo of ag.items || []) {
            syncRows.push({
              key: `hijo-${cap}-${hijo.item}`,
              kind: 'spacer',
              cap,
              height: ROW_H.hijo,
              label: '',
              barStart: null,
              barEnd: null,
            })
          }
        }
      }
      if (sinAgrupador.length > 0) {
        syncRows.push({
          key: `sin-ag-${cap}`,
          kind: 'spacer',
          cap,
          height: ROW_H.sinAg,
          label: '',
          barStart: null,
          barEnd: null,
        })
      }
    } else {
      for (const it of items) {
        const rk = itemRowKey(cap, it.item)
        const sched = resolveRowSchedule({
          cap, itemKey: it.item, rk, actMap, actividadKey, rowDraftRef, finOverrides, calcFinLocal,
        })
        syncRows.push({
          key: `item-${cap}-${it.item}`,
          kind: 'item',
          cap,
          height: ROW_H.item,
          label: it.item,
          labelTitle: it.descripcion || it.item,
          barStart: sched.fi,
          barEnd: sched.ff,
          duracion: sched.dur,
          isSummary: false,
        })
      }
    }
  }

  let timelineDays = computePkTimelineDays(
    capitulosOrdenados,
    itemsPorCapitulo,
    actMap,
    actividadKey,
    (c, itemCode) => {
      const s = getDraft(c, itemCode)
      return { fecha_inicio: s.fi, fecha_fin: s.ff }
    },
    estructuraPorCapitulo,
    agrupadorActItem,
  )
  if (!timelineDays.length) timelineDays = defaultTimelineDays()

  return {
    timelineDays,
    syncRows,
    fromT: timelineDays[0].getTime(),
  }
}

function ProgPkGanttPanel({ model, noHabilesSet, t, cpmByCapKey, activePk, bodyScrollRef, onBodyScroll, onRefresh }) {
  if (!model?.timelineDays?.length) return null
  const { timelineDays, syncRows, fromT } = model
  const dayPx = GANTT_DAY_PX
  const gridW = timelineDays.length * dayPx
  const labelW = GANTT_LABEL_W
  const monthRowH = 28
  const dayRowH = 26
  const timelineH = monthRowH + dayRowH
  const bodyH = syncRows.reduce((s, r) => s + r.height, 0)
  const contentW = labelW + gridW

  const monthSpans = useMemo(() => {
    const spans = []
    let i = 0
    while (i < timelineDays.length) {
      const d = timelineDays[i]
      const m = d.getMonth()
      const y = d.getFullYear()
      let j = i + 1
      while (j < timelineDays.length && timelineDays[j].getMonth() === m && timelineDays[j].getFullYear() === y) j++
      spans.push({ label: monthYearLabel(d), start: i, count: j - i })
      i = j
    }
    return spans
  }, [timelineDays])

  const dayNonHabil = (d) => {
    const iso = isoFromDate(d)
    return isWeekendDate(d) || noHabilesSet.has(iso)
  }

  const timelineHeader = (
    <div style={{ display: 'flex', width: contentW, minWidth: contentW }}>
      <div
        style={{
          width: labelW,
          flexShrink: 0,
          height: timelineH,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          padding: '2px 4px',
          boxSizing: 'border-box',
          borderRight: `1px solid ${t.border}`,
          background: t.bgCard,
        }}
      >
        {onRefresh ? <GanttRefreshButton onClick={onRefresh} /> : null}
      </div>
      <div style={{ position: 'relative', width: gridW, minWidth: gridW, flexShrink: 0 }}>
        {timelineDays.map((d, i) =>
          dayNonHabil(d) ? (
            <div
              key={`nh-h-${isoFromDate(d)}`}
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
                }}
                title={ms.label}
              >
                {ms.label}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', height: dayRowH, borderBottom: `1px solid ${t.border}`, background: t.bg }}>
            {timelineDays.map((d) => (
              <div
                key={`d-${isoFromDate(d)}`}
                style={{
                  width: dayPx,
                  minWidth: dayPx,
                  flexShrink: 0,
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
  )

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: t.bg,
        overflow: 'hidden',
        position: 'relative',
        isolation: 'isolate',
      }}
    >
      <div
        ref={bodyScrollRef}
        onScroll={onBodyScroll}
        style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
      >
        <div style={{ width: contentW, minWidth: '100%', position: 'relative', minHeight: bodyH + timelineH }}>
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              background: t.bgCard,
              borderBottom: `1px solid ${t.border}`,
            }}
          >
            {timelineHeader}
          </div>
          {timelineDays.map((d, i) =>
            dayNonHabil(d) ? (
              <div
                key={`nh-b-${isoFromDate(d)}`}
                style={{
                  position: 'absolute',
                  left: labelW + i * dayPx,
                  width: dayPx,
                  top: timelineH,
                  height: bodyH,
                  background: GANTT_NON_HABIL_BG,
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />
            ) : null,
          )}
          {syncRows.map((row) => {
            const cpmCap = row.kind === 'cap' ? cpmByCapKey?.[`${activePk}\u0000${row.cap}`] : null
            if (row.kind === 'spacer') {
              return <div key={row.key} style={{ height: row.height, borderBottom: `1px solid ${t.border}22` }} />
            }
            return (
              <GanttBarRow
                key={row.key}
                label={row.label}
                labelTitle={row.labelTitle || row.label}
                labelStyle={{
                  fontWeight: row.isSummary ? 700 : 500,
                  color: row.isSummary ? (cpmCap?.es_ruta_critica ? '#ef4444' : t.primary) : t.textMuted,
                  width: labelW,
                }}
                rowHeight={row.height}
                days={timelineDays}
                fromT={fromT}
                dayPx={dayPx}
                barStart={row.barStart}
                barEnd={row.barEnd}
                isSummary={row.isSummary}
                duracion={row.duracion}
                diasHab={row.diasHab}
                t={t}
                esCritico={!!cpmCap?.es_ruta_critica}
                holguraDias={cpmCap?.holgura_total ?? 0}
                holguraEnd={cpmCap?.fecha_fin_tardia ?? null}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

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

/** Rango de días del PK: min/max de fechas de ítems ± margen. */
function computePkTimelineDays(capitulosOrdenados, itemsPorCapitulo, actMap, actividadKey, getDraftValues, estructuraPorCapitulo, agrupadorActItem) {
  let minD = null
  let maxD = null
  for (const cap of capitulosOrdenados) {
    const eCap = estructuraPorCapitulo?.[cap]
    const agrupadores = eCap?.agrupadores || []
    const iter = agrupadores.length
      ? agrupadores.map((ag) => ({ item: agrupadorActItem(ag) }))
      : itemsPorCapitulo(cap)
    for (const it of iter) {
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

function GanttRowLabel({ label, labelTitle, labelStyle, rowHeight, t }) {
  return (
    <div
      style={{
        width: labelStyle?.width ?? GANTT_LABEL_W,
        flexShrink: 0,
        height: rowHeight,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 8,
        paddingRight: 4,
        fontSize: 'var(--cc-caption)',
        color: t.textMuted,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        borderRight: `1px solid ${t.border}44`,
        background: t.bgCard,
        ...labelStyle,
      }}
      title={labelTitle || undefined}
    >
      {label}
    </div>
  )
}

function GanttBarGrid({ rowHeight, days, fromT, dayPx, barStart, barEnd, isSummary, label, duracion, diasHab, t, esCritico, holguraDias, holguraEnd }) {
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

  let holguraLeft = 0
  let holguraWidth = 0
  if (holguraEnd && ff && !esCritico) {
    const fh = parseIsoDate(holguraEnd)
    if (fh && fh > ff) {
      const endIdx = Math.min(days.length - 1, Math.round((ff.getTime() - fromT) / 86400000))
      const hEndIdx = Math.min(days.length - 1, Math.round((fh.getTime() - fromT) / 86400000))
      holguraLeft = (endIdx + 1) * dayPx
      holguraWidth = Math.max((hEndIdx - endIdx) * dayPx, 0)
    }
  }

  const tooltip = ganttBarTooltip({ isSummary, label, barStart, barEnd, duracion, diasHab })
  const criticalTooltip = esCritico
    ? 'Ruta crítica — Holgura: 0 días'
    : holguraDias > 0
    ? `Holgura: ${holguraDias} día${holguraDias !== 1 ? 's' : ''} hábiles`
    : null

  return (
    <div
      style={{
        position: 'relative',
        width: days.length * dayPx,
        minWidth: days.length * dayPx,
        height: rowHeight,
        borderBottom: `1px solid ${t.border}44`,
        flexShrink: 0,
      }}
    >
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
      {holguraWidth > 0 && (
        <div
          style={{
            position: 'absolute',
            left: holguraLeft,
            width: holguraWidth,
            height: GANTT_BAR_H,
            top: '50%',
            transform: 'translateY(-50%)',
            borderRadius: '0 4px 4px 0',
            background: 'rgba(156,163,175,0.35)',
            border: '1px dashed #9ca3af',
            boxSizing: 'border-box',
            zIndex: 1,
          }}
          title={criticalTooltip || undefined}
        />
      )}
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
            background: isSummary ? (esCritico ? '#fee2e2' : GANTT_CAP_BAR) : GANTT_TEAL,
            border: esCritico ? '2px solid #ef4444' : 'none',
            boxSizing: 'border-box',
            zIndex: 2,
          }}
          title={criticalTooltip || tooltip}
        />
      )}
    </div>
  )
}

function GanttBarRow(props) {
  const { label, labelTitle, labelStyle, rowHeight, t } = props
  return (
    <div style={{ display: 'flex', height: rowHeight, borderBottom: `1px solid ${t.border}44`, alignItems: 'stretch' }}>
      <GanttRowLabel label={label} labelTitle={labelTitle} labelStyle={labelStyle} rowHeight={rowHeight} t={t} />
      <GanttBarGrid {...props} />
    </div>
  )
}

const TEAL_BADGE = '#1D9E75'

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
  rowKind = 'item',
  parentAct = null,
  agExpanded = false,
  onToggleAgExpand = null,
}) {
  const ex = act || {}
  const inherited = rowKind === 'hijo'
  const readOnly = rowKind === 'hijo' || rowKind === 'sin_agrupador'
  const effectiveEditable = editable && !readOnly
  const parentDates = parentAct || {}
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
    const api = {
      getValues: () => ({
        fecha_inicio: fechaIni,
        duracion: duracion,
        fecha_fin: finCalc,
      }),
      setFin: (iso) => setFinCalc(fmtDateIso(iso)),
    }
    registerRowDraft(rk, api)
    return () => unregisterRowDraft?.(rk)
  }, [rk, fechaIni, duracion, finCalc, registerRowDraft, unregisterRowDraft, rowKind])

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
    if (!effectiveEditable || saveStatus === 'saving') return false
    const d = parseInt(String(duracion), 10)
    if (!fechaIni || !(d > 0)) return false
    const ok = await onGuardarItem(itemDef, { fecha_inicio: fechaIni, duracion: String(d), override_manual: true, heredado_de_capitulo: false }, rk)
    if (ok) dirtyRef.current = false
    return ok
  }, [effectiveEditable, saveStatus, onGuardarItem, itemDef, fechaIni, duracion, rk])

  useEffect(() => {
    if (!effectiveEditable || !dirtyRef.current) return undefined
    const d = parseInt(String(debDur), 10)
    if (!debFecha || !(d > 0)) return undefined
    const timer = setTimeout(() => trySave(), 700)
    return () => clearTimeout(timer)
  }, [debFecha, debDur, editable, trySave])

  const onBlurField = () => {
    if (dirtyRef.current) trySave()
  }

  const inheritedBadge = (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 700,
        color: '#fff',
        background: TEAL_BADGE,
        borderRadius: 3,
        padding: '1px 5px',
        lineHeight: 1.3,
      }}
      title="Heredado del agrupador"
    >
      H
    </span>
  )

  const saveIcon =
    saveStatus === 'saving' ? (
      <span style={{ color: t.textMuted }}>…</span>
    ) : saveStatus === 'saved' ? (
      <span style={{ color: TEAL_BADGE, fontWeight: 700 }}>✓</span>
    ) : saveStatus === 'error' ? (
      <span style={{ color: '#b91c1c', fontWeight: 700 }}>!</span>
    ) : inherited ? (
      inheritedBadge
    ) : null

  const displayIni = readOnly
    ? (fmtDateIso(ex.fecha_inicio) || fmtDateIso(parentDates.fecha_inicio) || '—')
    : fechaIni
  const displayDur = readOnly
    ? (ex.duracion_dias_habiles ?? parentDates.duracion_dias_habiles ?? '—')
    : duracion
  const displayFin = readOnly
    ? (fmtDateHuman(finCalc || ex.fecha_fin_calculada || parentDates.fecha_fin_calculada) || '—')
    : fmtDateHuman(finCalc || ex.fecha_fin_calculada)

  const agrupadorLabel = `${itemDef.codigo_wbs ? `${itemDef.codigo_wbs} · ` : ''}${itemDef.agrupador_nombre || itemDef.descripcion || itemDef.item}`

  const isHijo = rowKind === 'hijo'
  const hijoBg = 'rgba(243, 244, 246, 0.85)'
  const rowH = isHijo ? ROW_H.hijo : rowKind === 'agrupador' ? ROW_H.agrupador : ROW_H.item
  const cell = {
    padding: '0 8px',
    fontSize: isHijo ? 'var(--cc-caption)' : 'var(--cc-sm)',
    lineHeight: 1.35,
    verticalAlign: 'middle',
    height: rowH,
    maxHeight: rowH,
    boxSizing: 'border-box',
    overflow: 'hidden',
  }
  const sticky = { position: 'sticky', background: isHijo ? hijoBg : stickyBg, zIndex: 1 }

  if (rowKind === 'agrupador') {
    return (
      <tr style={{ borderBottom: `1px solid ${t.border}` }}>
        <td
          colSpan={2}
          style={{
            ...cell,
            ...sticky,
            left: 0,
            minWidth: STICKY_W.item + STICKY_W.desc,
            maxWidth: STICKY_W.item + STICKY_W.desc,
            fontWeight: 700,
            color: t.text,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleAgExpand?.()
              }}
              aria-expanded={agExpanded}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 'var(--cc-sm)',
                color: t.textMuted,
                padding: '0 2px',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {agExpanded ? '▼' : '▶'}
            </button>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={agrupadorLabel}>
              {agrupadorLabel}
            </span>
          </div>
        </td>
        <td style={{ ...cell, minWidth: 48 }}>{itemDef.und || '—'}</td>
        <td style={{ ...cell, textAlign: 'right', minWidth: 72 }}>{fmtCant(itemDef.cant_total)}</td>
        <td style={{ ...cell, textAlign: 'right', minWidth: 110, whiteSpace: 'nowrap' }}>{fmtCOP(itemDef.costo_directo)}</td>
        <td style={{ ...cell, minWidth: 148 }}>
          {effectiveEditable ? (
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
            displayIni
          )}
        </td>
        <td style={{ ...cell, minWidth: 64 }}>
          {effectiveEditable ? (
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
            displayDur
          )}
        </td>
        <td style={{ ...cell, minWidth: 200, color: t.textMuted, whiteSpace: 'nowrap' }}>{displayFin}</td>
        <td style={{ ...cell, width: 28, textAlign: 'center' }}>{saveIcon}</td>
      </tr>
    )
  }

  return (
    <tr style={{ borderBottom: `1px solid ${t.border}`, background: isHijo ? hijoBg : undefined }}>
      <td style={{ ...cell, ...sticky, left: 0, fontWeight: isHijo ? 500 : 600, minWidth: STICKY_W.item, maxWidth: STICKY_W.item, paddingLeft: isHijo ? 36 : 8 }} title={itemDef.item}>
        {itemDef.item}
      </td>
      <td style={{ ...cell, ...sticky, left: STICKY_W.item, minWidth: STICKY_W.desc, maxWidth: STICKY_W.desc, color: isHijo ? t.textMuted : t.textMuted, paddingLeft: isHijo ? 12 : 8 }} title={itemDef.descripcion}>
        {itemDef.descripcion || '—'}
      </td>
      <td style={{ ...cell, minWidth: 48 }}>{itemDef.und || '—'}</td>
      <td style={{ ...cell, textAlign: 'right', minWidth: 72 }}>{fmtCant(itemDef.cant_total)}</td>
      <td style={{ ...cell, textAlign: 'right', minWidth: 110, whiteSpace: 'nowrap' }}>{fmtCOP(itemDef.costo_directo)}</td>
      <td style={{ ...cell, minWidth: 148 }}>
        {effectiveEditable ? (
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
          displayIni
        )}
      </td>
      <td style={{ ...cell, minWidth: 64 }}>
        {effectiveEditable ? (
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
          displayDur
        )}
      </td>
      <td style={{ ...cell, minWidth: 200, color: t.textMuted, whiteSpace: 'nowrap' }}>{displayFin}</td>
      <td style={{ ...cell, width: 28, textAlign: 'center' }}>{saveIcon}</td>
    </tr>
  )
}

function ProgCapituloSection({
  cap,
  capIdx,
  estructuraCap,
  items,
  actMap,
  actividadKey,
  itemRowKey,
  agrupadorActItem,
  agrupadorRowKey,
  collapsed,
  onToggleCollapse,
  capResumen,
  editable,
  t,
  cid,
  token,
  API,
  rowSaveStatus,
  onGuardarItem,
  registerRowDraft,
  unregisterRowDraft,
  finOverrides,
  isAgExpanded,
  onToggleAgExpand,
}) {
  const pal = capColor(capIdx)
  const useWbs = Boolean(estructuraCap?.agrupadores?.length || estructuraCap?.sin_agrupador?.length)
  const agrupadores = estructuraCap?.agrupadores || []
  const sinAgrupador = estructuraCap?.sin_agrupador || []

  const buildAgItemDef = (ag) => {
    const actItem = agrupadorActItem(ag)
    const cant = Number(ag.cant_total) || 0
    const costo = Number(ag.costo_directo) || 0
    return {
      es_agrupador: true,
      agrupador_id: ag.agrupador_id,
      codigo_wbs: ag.codigo_wbs,
      agrupador_nombre: ag.agrupador_nombre,
      capitulo: cap,
      item: actItem,
      descripcion: ag.agrupador_nombre,
      cant_total: cant > 0 ? cant : 1,
      und: ag.items?.[0]?.und || '?',
      vlr_unitario: cant > 0 ? costo / cant : costo,
      costo_directo: costo,
    }
  }

  const capCell = {
    padding: '0 8px',
    fontSize: 'var(--cc-sm)',
    lineHeight: 1.35,
    verticalAlign: 'middle',
    height: ROW_H.cap,
    maxHeight: ROW_H.cap,
    boxSizing: 'border-box',
    overflow: 'hidden',
  }

  return (
    <>
      <tr style={{ background: pal.bg, borderTop: `2px solid ${pal.border}` }}>
        <td colSpan={2} style={{ ...capCell, fontWeight: 700, color: t.text }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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
                flexShrink: 0,
              }}
            >
              {collapsed ? '▸' : '▾'}
            </button>
            <span
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={`Capítulo ${cap}`}
            >
              Capítulo {cap}
            </span>
          </div>
        </td>
        <td style={{ ...capCell, color: t.textMuted }}>—</td>
        <td style={{ ...capCell, textAlign: 'right' }} title={String(capResumen?.cant_total ?? '')}>
          {capResumen?.cant_total > 0 ? fmtCant(capResumen.cant_total) : '—'}
        </td>
        <td style={{ ...capCell, textAlign: 'right', whiteSpace: 'nowrap' }} title={String(capResumen?.costo_directo ?? '')}>
          {capResumen?.costo_directo > 0 ? fmtCOP(capResumen.costo_directo) : '—'}
        </td>
        <td style={{ ...capCell, color: t.textMuted }} title={capResumen?.fecha_inicio || ''}>
          {capResumen?.fecha_inicio || '—'}
        </td>
        <td style={{ ...capCell, textAlign: 'right', color: t.textMuted }} title="Días hábiles entre inicio y fin del capítulo">
          {capResumen?.dias_habiles ?? '—'}
        </td>
        <td style={{ ...capCell, color: t.textMuted, whiteSpace: 'nowrap' }} title={capResumen?.fecha_fin || ''}>
          {capResumen?.fecha_fin ? fmtDateHuman(capResumen.fecha_fin) : '—'}
        </td>
        <td style={{ ...capCell, width: 28 }} />
      </tr>
      {!collapsed && useWbs && agrupadores.map((ag) => {
        const agDef = buildAgItemDef(ag)
        const actItem = agrupadorActItem(ag)
        const rk = agrupadorRowKey(cap, ag)
        const agAct = actMap[actividadKey(cap, actItem, 1)]
        const expanded = isAgExpanded(ag.agrupador_id)
        return (
          <Fragment key={`ag-${ag.agrupador_id}`}>
            <ProgItemRow
              itemDef={agDef}
              act={agAct}
              rk={rk}
              cid={cid}
              token={token}
              API={API}
              t={t}
              editable={editable}
              saveStatus={rowSaveStatus[rk] || 'idle'}
              onGuardarItem={onGuardarItem}
              stickyBg={t.bgCard}
              registerRowDraft={registerRowDraft}
              unregisterRowDraft={unregisterRowDraft}
              finOverride={finOverrides[rk]}
              rowKind="agrupador"
              agExpanded={expanded}
              onToggleAgExpand={() => onToggleAgExpand(ag.agrupador_id)}
            />
            {expanded && (ag.items || []).map((hijo) => (
              <ProgItemRow
                key={itemRowKey(cap, hijo.item)}
                itemDef={{ ...hijo, capitulo: cap }}
                act={actMap[actividadKey(cap, hijo.item, 1)]}
                rk={itemRowKey(cap, hijo.item)}
                cid={cid}
                token={token}
                API={API}
                t={t}
                editable={false}
                saveStatus="idle"
                onGuardarItem={onGuardarItem}
                stickyBg={t.bgCard}
                rowKind="hijo"
                parentAct={agAct}
              />
            ))}
          </Fragment>
        )
      })}
      {!collapsed && useWbs && sinAgrupador.length > 0 && (
        <tr style={{ background: 'rgba(245,158,11,0.06)' }}>
          <td colSpan={9} style={{ padding: '6px 12px', fontSize: 'var(--cc-sm)', fontWeight: 600, color: '#b45309' }}>
            ⚠ Ítems sin agrupador ({sinAgrupador.length})
          </td>
        </tr>
      )}
      {!collapsed && !useWbs &&
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
  estructuraPorCapitulo = {},
  agrupadorActItem = (ag) => String(ag?.codigo_wbs || `AG${ag?.agrupador_id ?? ''}`).trim(),
  agrupadorRowKey = (cap, ag) => `${cap}\u0000ag:${String(ag?.codigo_wbs || `AG${ag?.agrupador_id ?? ''}`).trim()}`,
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
  allPkIds,
  onCpmUpdated,
}) {
  const [collapsedCaps, setCollapsedCaps] = useState({})
  const [expandedAgs, setExpandedAgs] = useState({})
  const [noHabilesSet, setNoHabilesSet] = useState(new Set())
  const [finOverrides, setFinOverrides] = useState({})
  const [localSaving, setLocalSaving] = useState(false)
  const [rowDrafts, setRowDrafts] = useState({})
  const rowDraftRef = useRef({})
  const leftScrollRef = useRef(null)
  const rightBodyScrollRef = useRef(null)
  const scrollSyncLock = useRef(false)
  const [activeContentTab, setActiveContentTab] = useState('programacion')
  const [cpmResultados, setCpmResultados] = useState([])

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

  useEffect(() => {
    if (!open || !workingVersion?.id) { setCpmResultados([]); return }
    fetch(`${API}/prog-obra/${cid}/versiones/${workingVersion.id}/cpm-resultados`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { resultados: [] }))
      .then((d) => {
        const resultados = d.resultados || []
        setCpmResultados(resultados)
        onCpmUpdated?.(resultados)
      })
      .catch(() => setCpmResultados([]))
  }, [open, workingVersion?.id, cid, token, API])

  const toggleCap = (cap) => {
    const k = `${activePk}\u0000${cap}`
    setCollapsedCaps((s) => ({ ...s, [k]: !s[k] }))
  }

  const agExpandKey = (cap, agId) => `${activePk}\u0000${cap}\u0000${agId}`
  const isAgExpanded = useCallback(
    (cap, agId) => !!expandedAgs[agExpandKey(cap, agId)],
    [expandedAgs, activePk],
  )
  const toggleAgExpand = (cap, agId) => {
    const k = agExpandKey(cap, agId)
    setExpandedAgs((s) => ({ ...s, [k]: !s[k] }))
  }

  const cpmByCapKey = useMemo(() => {
    const m = {}
    for (const r of cpmResultados) {
      m[`${r.pk_id}\u0000${r.capitulo}`] = r
    }
    return m
  }, [cpmResultados])

  // Cuando fecha_fin_calculada no está en actMap (datos viejos o sin RPC),
  // la recalcula localmente usando días hábiles y noHabilesSet.
  const calcFinLocal = useCallback((fi, dur) => {
    if (!fi || !(dur > 0)) return null
    let d = parseIsoDate(fi)
    if (!d) return null
    let count = 0
    let safety = 0
    while (count < dur && safety < 1000) {
      d = addCalendarDays(d, 1)
      safety++
      if (!isWeekendDate(d) && !noHabilesSet.has(isoFromDate(d))) count++
    }
    return isoFromDate(d)
  }, [noHabilesSet])

  const capResumenes = useMemo(() => {
    const m = {}
    for (const cap of capitulosOrdenados) {
      m[cap] = computeCapConsolidado({
        cap,
        estructuraCap: estructuraPorCapitulo?.[cap],
        items: itemsPorCapitulo(cap),
        agrupadorActItem,
        agrupadorRowKey,
        itemRowKey,
        actMap,
        actividadKey,
        rowDraftRef,
        finOverrides,
        calcFinLocal,
        noHabilesSet,
      })
    }
    return m
  }, [
    capitulosOrdenados,
    estructuraPorCapitulo,
    itemsPorCapitulo,
    agrupadorActItem,
    agrupadorRowKey,
    itemRowKey,
    actMap,
    actividadKey,
    finOverrides,
    calcFinLocal,
    noHabilesSet,
    rowDrafts,
  ])

  const pkGanttModel = useMemo(
    () => buildPkGanttLayout({
      capitulosOrdenados,
      activePk,
      collapsedCaps,
      expandedAgs,
      estructuraPorCapitulo,
      itemsPorCapitulo,
      actMap,
      actividadKey,
      agrupadorActItem,
      agrupadorRowKey,
      itemRowKey,
      rowDraftRef,
      finOverrides,
      calcFinLocal,
      noHabilesSet,
    }),
    [
      capitulosOrdenados,
      activePk,
      collapsedCaps,
      expandedAgs,
      estructuraPorCapitulo,
      itemsPorCapitulo,
      actMap,
      actividadKey,
      agrupadorActItem,
      agrupadorRowKey,
      itemRowKey,
      finOverrides,
      calcFinLocal,
      noHabilesSet,
      rowDrafts,
    ],
  )

  const handleLeftScroll = useCallback(() => {
    if (scrollSyncLock.current) return
    scrollSyncLock.current = true
    const top = leftScrollRef.current?.scrollTop ?? 0
    if (rightBodyScrollRef.current) rightBodyScrollRef.current.scrollTop = top
    requestAnimationFrame(() => { scrollSyncLock.current = false })
  }, [])

  const handleRightBodyScroll = useCallback(() => {
    if (scrollSyncLock.current) return
    scrollSyncLock.current = true
    const top = rightBodyScrollRef.current?.scrollTop ?? 0
    if (leftScrollRef.current) leftScrollRef.current.scrollTop = top
    requestAnimationFrame(() => { scrollSyncLock.current = false })
  }, [])

  const refreshPkGantt = useCallback(() => {
    const next = { ...finOverrides }
    for (const cap of capitulosOrdenados) {
      const eCap = estructuraPorCapitulo?.[cap]
      const agrupadores = eCap?.agrupadores || []
      const iter = agrupadores.length
        ? agrupadores.map((ag) => ({
          rk: agrupadorRowKey(cap, ag),
          itemKey: agrupadorActItem(ag),
        }))
        : itemsPorCapitulo(cap).map((it) => ({
          rk: itemRowKey(cap, it.item),
          itemKey: it.item,
        }))
      for (const { rk, itemKey } of iter) {
        const draft = rowDraftRef.current[rk]?.getValues?.()
        const act = actMap[actividadKey(cap, itemKey, 1)]
        const fi = fmtDateIso(draft?.fecha_inicio ?? act?.fecha_inicio)
        const durRaw = draft?.duracion != null && draft.duracion !== '' ? draft.duracion : act?.duracion_dias_habiles
        const dur = durRaw != null ? parseInt(String(durRaw), 10) : NaN
        if (!fi || !(dur > 0)) continue
        const ff = fmtDateIso(draft?.fecha_fin ?? act?.fecha_fin_calculada) || calcFinLocal(fi, dur)
        if (ff) next[rk] = ff
      }
    }
    setFinOverrides(next)
  }, [
    finOverrides,
    capitulosOrdenados,
    estructuraPorCapitulo,
    agrupadorRowKey,
    agrupadorActItem,
    itemsPorCapitulo,
    itemRowKey,
    actMap,
    actividadKey,
    calcFinLocal,
  ])

  const collectDraftItems = useCallback(() => {
    const itemsAGuardar = []
    let skipped = 0
    for (const cap of capitulosOrdenados) {
      const eCap = estructuraPorCapitulo?.[cap]
      const agrupadores = eCap?.agrupadores || []
      const iter = agrupadores.length
        ? agrupadores.map((ag) => {
          const actItem = agrupadorActItem(ag)
          const cant = Number(ag.cant_total) || 0
          const costo = Number(ag.costo_directo) || 0
          return {
            rk: agrupadorRowKey(cap, ag),
            itemDef: {
              es_agrupador: true,
              agrupador_id: ag.agrupador_id,
              codigo_wbs: ag.codigo_wbs,
              capitulo: cap,
              item: actItem,
              cant_total: cant > 0 ? cant : 1,
              und: ag.items?.[0]?.und || '?',
              vlr_unitario: cant > 0 ? costo / cant : costo,
            },
            actItem,
          }
        })
        : itemsPorCapitulo(cap).map((it) => ({
          rk: itemRowKey(cap, it.item),
          itemDef: it,
          actItem: it.item,
        }))
      for (const row of iter) {
        const live = rowDraftRef.current[row.rk]?.getValues?.()
        const stored = rowDrafts[row.rk]
        const act = actMap[actividadKey(cap, row.actItem, 1)]
        const liveFecha = live != null ? (live.fecha_inicio ?? '') : null
        const fecha = fmtDateIso(liveFecha !== null ? liveFecha : (stored?.fecha_inicio ?? act?.fecha_inicio))
        const durRaw = live?.duracion ?? stored?.duracion ?? act?.duracion_dias_habiles
        const dur = parseInt(String(durRaw), 10)
        if (!fecha || !(dur > 0)) {
          itemsAGuardar.push({ itemDef: row.itemDef, rk: row.rk, fecha_inicio: null, duracion: null })
          skipped += 1
          continue
        }
        itemsAGuardar.push({ itemDef: row.itemDef, rk: row.rk, fecha_inicio: fecha, duracion: dur })
      }
    }
    return { itemsAGuardar, skipped }
  }, [capitulosOrdenados, estructuraPorCapitulo, agrupadorActItem, agrupadorRowKey, itemsPorCapitulo, actMap, actividadKey, itemRowKey, rowDrafts])

  const flushAllDrafts = useCallback(async () => {
    if (!editable) return { saved: 0, errors: 0, skipped: 0 }
    const { itemsAGuardar, skipped } = collectDraftItems()
    const validRows = itemsAGuardar.filter((row) => row.fecha_inicio && row.duracion > 0)
    console.debug('[ProgObra] flushAllDrafts', {
      filasTotal: itemsAGuardar.length,
      filasValidas: validRows.length,
      omitidas: skipped,
      draftsRegistrados: Object.keys(rowDraftRef.current).length,
      activePk,
    })
    if (validRows.length === 0) {
      if (itemsAGuardar.length === 0) {
        console.warn('[ProgObra] flushAllDrafts: sin filas agrupador/ítem — revise estructura WBS')
      }
      return { saved: 0, errors: 0, skipped: skipped || itemsAGuardar.length }
    }
    if (onGuardarBatch) {
      const batchPayload = validRows.map((row) => ({
        capitulo: row.itemDef.capitulo,
        item: row.itemDef.item,
        fecha_inicio: row.fecha_inicio,
        duracion: row.duracion,
        override_manual: true,
        heredado_de_capitulo: false,
        itemDef: row.itemDef,
        rk: row.rk,
      }))
      console.debug('[ProgObra] POST actividades-batch', { count: batchPayload.length, pk: activePk })
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
      await new Promise((r) => setTimeout(r, 80))
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

        {/* Content tabs: Programación | Dependencias */}
        <div style={{ display: 'flex', gap: 0, padding: '0 16px', borderBottom: `1px solid ${t.border}`, flexShrink: 0, background: t.bg }}>
          {['programacion', 'dependencias'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveContentTab(tab)}
              style={{
                padding: '8px 16px',
                fontSize: 'var(--cc-sm)',
                fontWeight: activeContentTab === tab ? 700 : 400,
                color: activeContentTab === tab ? t.primary : t.textMuted,
                background: 'transparent',
                border: 'none',
                borderBottom: activeContentTab === tab ? `2px solid ${t.primary}` : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {tab === 'programacion' ? 'Programación' : 'Dependencias'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeContentTab === 'dependencias' ? (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 16px' }}>
              <ProgObraDependencias
                cid={cid}
                token={token}
                API={API}
                t={t}
                versionId={workingVersion?.id}
                activePk={activePk}
                allPkIds={allPkIds}
                capitulosOrigen={capitulosOrdenados}
                estructuraPorCapitulo={estructuraPorCapitulo}
                editable={editable}
                showToast={showToast}
                onCpmCalculated={(resultados) => {
                  setCpmResultados(resultados)
                  onCpmUpdated?.(resultados)
                }}
              />
            </div>
          ) : (
            <>
          {(loadPpto || loadAct) && (
            <div style={{ color: t.textMuted, padding: '8px 16px', flexShrink: 0 }}>Cargando datos del PK…</div>
          )}
          {!loadPpto && capitulosOrdenados.length === 0 && (
            <div style={{ color: t.textMuted, padding: '8px 16px' }}>Sin ítems de presupuesto para este PK.</div>
          )}
          {capitulosOrdenados.length > 0 && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-start', overflow: 'hidden' }}>
              <div
                style={{
                  width: PANEL_LEFT,
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  alignSelf: 'stretch',
                  borderRight: `1px solid ${t.border}`,
                  overflow: 'hidden',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <div style={{ flexShrink: 0, overflow: 'hidden', padding: '0 8px', background: t.bg, height: TABLE_HEAD_H, boxSizing: 'border-box' }}>
                  <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', height: TABLE_HEAD_H }}>
                    <thead>
                      <tr style={{ background: t.bg, borderBottom: `2px solid ${t.border}`, height: TABLE_HEAD_H }}>
                        {['Ítem', 'Descripción', 'Und', 'Cantidad', 'Costo Directo', 'Fecha inicio', 'Días hábiles', 'Fecha fin', ''].map((h, i) => (
                          <th
                            key={h}
                            style={{
                              padding: '0 10px',
                              height: TABLE_HEAD_H,
                              boxSizing: 'border-box',
                              fontSize: 'var(--cc-caption)',
                              fontWeight: 700,
                              color: t.textMuted,
                              textAlign: i >= 3 && i <= 4 ? 'right' : 'left',
                              verticalAlign: 'middle',
                              minWidth: i === 0 ? STICKY_W.item : i === 1 ? STICKY_W.desc : undefined,
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  </table>
                </div>
                <div
                  ref={leftScrollRef}
                  onScroll={handleLeftScroll}
                  style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 8px 8px' }}
                >
                  <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%' }}>
                    <tbody>
                    {capitulosOrdenados.map((cap, capIdx) => {
                      const capKey = `${activePk}\u0000${cap}`
                      const items = itemsPorCapitulo(cap)
                      const collapsed = !!collapsedCaps[capKey]
                      return (
                        <ProgCapituloSection
                          key={cap}
                          cap={cap}
                          capIdx={capIdx}
                          estructuraCap={estructuraPorCapitulo?.[cap]}
                          items={items}
                          actMap={actMap}
                          actividadKey={actividadKey}
                          itemRowKey={itemRowKey}
                          agrupadorActItem={agrupadorActItem}
                          agrupadorRowKey={agrupadorRowKey}
                          collapsed={collapsed}
                          onToggleCollapse={() => toggleCap(cap)}
                          capResumen={capResumenes[cap]}
                          editable={editable}
                          t={t}
                          cid={cid}
                          token={token}
                          API={API}
                          rowSaveStatus={rowSaveStatus}
                          onGuardarItem={onGuardarItem}
                          registerRowDraft={registerRowDraft}
                          unregisterRowDraft={unregisterRowDraft}
                          finOverrides={finOverrides}
                          isAgExpanded={(agId) => isAgExpanded(cap, agId)}
                          onToggleAgExpand={(agId) => toggleAgExpand(cap, agId)}
                        />
                      )
                    })}
                  </tbody>
                </table>
                </div>
              </div>
              <div
                style={{
                  width: PANEL_RIGHT,
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  alignSelf: 'stretch',
                  overflow: 'hidden',
                  position: 'relative',
                  isolation: 'isolate',
                }}
              >
                <ProgPkGanttPanel
                  model={pkGanttModel}
                  noHabilesSet={noHabilesSet}
                  t={t}
                  activePk={activePk}
                  cpmByCapKey={cpmByCapKey}
                  bodyScrollRef={rightBodyScrollRef}
                  onBodyScroll={handleRightBodyScroll}
                  onRefresh={refreshPkGantt}
                />
              </div>
            </div>
          )}
            </>
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
